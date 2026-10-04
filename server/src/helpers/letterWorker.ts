import { fork } from 'child_process'
import path from 'path'
import { randomBytes } from 'crypto'
import prisma from '../prisma'
import { driveRequest } from './letterDrive'
import { TEST_WORKSPACE } from './testSandbox'

export function renderLetterPreview(
  original: Buffer,
  mime: string
): Promise<{ pages: string[]; pageCount: number }> {
  return new Promise((resolve, reject) => {
    const child = fork(
      path.resolve(__dirname, '../../dist/helpers/letterPreviewChild.js'),
      [],
      {
        execArgv: ['--max-old-space-size=256'],
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          TEMP: process.env.TEMP,
        },
      }
    )
    const timer = setTimeout(() => {
      child.kill()
      reject(
        new Error(
          'Preview generation timed out. Download the original or retry.'
        )
      )
    }, 45000)
    const finish = () => {
      clearTimeout(timer)
      child.kill()
    }
    child.once('message', (result: any) => {
      finish()
      result.error ? reject(new Error(result.error)) : resolve(result)
    })
    child.once('error', () => {
      finish()
      reject(new Error('Preview worker could not start'))
    })
    child.once('exit', () => {
      clearTimeout(timer)
      reject(new Error('Preview worker could not process this document'))
    })
    child.send({ base64: original.toString('base64'), mime })
  })
}

export async function processLetterJob(kind: 'upload' | 'preview') {
  const now = new Date(),
    state = `${kind}State`,
    next = `${kind}NextAt`,
    lease = `${kind}LeaseUntil`,
    attempts = `${kind}Attempts`
  // Atomic compare-and-swap lets multiple API processes safely share the queue.
  const candidate = await prisma.letterAttachment.findFirst({
    where: {
      OR: [
        { [state]: 'PENDING', [next]: { lte: now } },
        { [state]: 'PROCESSING', [lease]: { lt: now } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (!candidate) return false
  const claimed = await prisma.letterAttachment.updateMany({
    where: {
      id: candidate.id,
      OR: [
        { [state]: 'PENDING', [next]: { lte: now } },
        { [state]: 'PROCESSING', [lease]: { lt: now } },
      ],
    },
    data: {
      [state]: 'PROCESSING',
      [lease]: new Date(Date.now() + 180000),
      [attempts]: { increment: 1 },
    },
  })
  if (!claimed.count) return true
  const file = await prisma.letterAttachment.findUniqueOrThrow({
    where: { id: candidate.id },
    include: { event: { include: { thread: true } } },
  })
  try {
    if (kind === 'preview') {
      const result = await renderLetterPreview(file.original, file.mime)
      await prisma.$transaction(async (db) => {
        await db.letterPreview.deleteMany({ where: { attachmentId: file.id } })
        for (let i = 0; i < result.pages.length; i++)
          await db.letterPreview.create({
            data: {
              attachmentId: file.id,
              page: i + 1,
              bytes: Buffer.from(result.pages[i], 'base64'),
            },
          })
        await db.letterAttachment.update({
          where: { id: file.id },
          data: {
            previewState: 'READY',
            previewError: null,
            previewLeaseUntil: null,
            pageCount: result.pageCount,
          },
        })
      })
    } else {
      if (file.event.workspaceId === TEST_WORKSPACE) {
        await prisma.letterAttachment.update({ where: { id: file.id }, data: {
          uploadState: 'READY', uploadError: null, uploadLeaseUntil: null,
        } })
        return true
      }
      const config = await prisma.letterSettings.findUnique({
        where: { workspaceId: file.event.workspaceId },
      })
      if (!config?.connected || !config.folderId) {
        await prisma.letterAttachment.update({
          where: { id: file.id },
          data: {
            uploadState: 'BLOCKED',
            uploadError: 'Waiting for the Director to connect Google Drive.',
            uploadLeaseUntil: null,
          },
        })
        return true
      }
      // Reserve and persist a Drive ID BEFORE uploading. A retry reuses that ID.
      let driveId = file.driveFileId,
        folderId = file.driveFolderId || config.folderId
      if (!driveId) {
        const ids = await driveRequest(
          config,
          'files/generateIds?count=1&space=drive&type=files'
        )
        driveId = ids.ids[0]
        await prisma.letterAttachment.update({
          where: { id: file.id },
          data: { driveFileId: driveId, driveFolderId: folderId },
        })
      }
      const boundary = 'taskwise_' + randomBytes(12).toString('hex')
      const metadata = {
        id: driveId,
        name: `${file.event.thread.reference}_${String(file.event.sequence).padStart(3, '0')}_${file.name}`,
        parents: [folderId],
        appProperties: { taskwiseAttachmentId: file.id, sha256: file.sha256 },
      }
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${file.mime}\r\n\r\n`
        ),
        file.original,
        Buffer.from(`\r\n--${boundary}--`),
      ])
      try {
        await driveRequest(
          config,
          'files?uploadType=multipart&supportsAllDrives=true&fields=id',
          {
            method: 'POST',
            headers: {
              'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body: body as any,
          },
          true
        )
      } catch (e: any) {
        if (e.driveStatus !== 409) throw e
        const saved = await driveRequest(
          config,
          `files/${driveId}?supportsAllDrives=true&fields=id,size,appProperties,trashed`
        )
        if (
          saved.trashed ||
          saved.appProperties?.taskwiseAttachmentId !== file.id ||
          saved.appProperties?.sha256 !== file.sha256 ||
          Number(saved.size) !== file.size
        )
          throw new Error('Drive file conflict. Director review required.')
      }
      await prisma.letterAttachment.update({
        where: { id: file.id },
        data: {
          uploadState: 'READY',
          uploadError: null,
          uploadLeaseUntil: null,
        },
      })
    }
  } catch (error: any) {
    const count = kind === 'upload' ? file.uploadAttempts : file.previewAttempts
    const message =
      kind === 'preview'
        ? String(error.message).slice(0, 250)
        : 'Google Drive upload failed. Check the connection and folder permissions, then retry.'
    await prisma.letterAttachment.update({
      where: { id: file.id },
      data: {
        [state]: count >= 3 ? 'FAILED' : 'PENDING',
        [`${kind}Error`]: message,
        [lease]: null,
        [next]: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** count)),
      },
    })
  }
  return true
}

export function startLetterWorker() {
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await Promise.all([
        processLetterJob('upload'),
        processLetterJob('preview'),
      ])
    } catch {
      console.error('Letter background queue temporarily unavailable')
    } finally {
      running = false
    }
  }
  const timer = setInterval(tick, 5000)
  timer.unref()
  void tick()
}
