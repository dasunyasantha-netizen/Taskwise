import { randomBytes } from 'crypto'
import prisma from '../prisma'
import { createFolder, driveRequest, oauth } from './letterDrive'

// YSO qualification certificates are stored only in the workspace's Google
// Drive (a "YSO Certificates" folder inside the Letters folder). The server
// keeps the Drive file ID and metadata; bytes only pass through memory.

export const CERTIFICATE_MAX_BYTES = 10 * 1024 * 1024
export const CERTIFICATE_FOLDER = 'YSO Certificates'

export class CertificateError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export type CertificateFile = { name: string; mime: string; bytes: Buffer }

/** Validates an uploaded scan (base64 JSON) by size and real file signature. */
export function parseCertificate(upload: any): CertificateFile {
  if (
    !upload ||
    typeof upload.base64 !== 'string' ||
    upload.base64.length > Math.ceil(CERTIFICATE_MAX_BYTES / 3) * 4 + 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(upload.base64)
  )
    throw new CertificateError(400, 'Upload a PDF, PNG or JPEG scan up to 10 MB')
  const bytes = Buffer.from(upload.base64, 'base64')
  const mime =
    bytes.subarray(0, 5).toString() === '%PDF-'
      ? 'application/pdf'
      : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? 'image/png'
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          ? 'image/jpeg'
          : ''
  if (!mime || !bytes.length || bytes.length > CERTIFICATE_MAX_BYTES)
    throw new CertificateError(400, 'Unsupported file format or the scan exceeds 10 MB')
  const raw = typeof upload.name === 'string' ? upload.name.trim() : ''
  const name = (raw || 'certificate').replace(/[\r\n\\/]/g, '_').slice(0, 180)
  return { name, mime, bytes }
}

async function connectedSettings(workspaceId: string) {
  const config = await prisma.letterSettings.findUnique({ where: { workspaceId } })
  if (!config?.connected || !config.folderId)
    throw new CertificateError(
      409,
      'Google Drive is not connected. Ask your Director to connect Google Drive (Settings → Letter management) before uploading certificates.'
    )
  return config
}

export async function isDriveConnected(workspaceId: string) {
  const config = await prisma.letterSettings.findUnique({
    where: { workspaceId },
    select: { connected: true, folderId: true },
  })
  return !!(config?.connected && config.folderId)
}

/** Returns the certificates subfolder, creating it inside the Letters folder when missing. */
async function certificateFolder(config: Awaited<ReturnType<typeof connectedSettings>>) {
  if (config.ysoFolderId) {
    try {
      const folder = await driveRequest(
        config,
        `files/${config.ysoFolderId}?supportsAllDrives=true&fields=id,trashed`
      )
      if (!folder.trashed) return config.ysoFolderId
    } catch {}
  }
  const folder = await driveRequest(config, 'files?supportsAllDrives=true&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: CERTIFICATE_FOLDER,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [config.folderId],
    }),
  }).catch(() => ({ id: '' }))
  // Fall back to a top-level folder if the Letters folder can't take children.
  const id = folder.id || (await createFolder(config, `Taskwise ${CERTIFICATE_FOLDER}`))
  await prisma.letterSettings.update({
    where: { workspaceId: config.workspaceId },
    data: { ysoFolderId: id },
  })
  return id
}

const extension = (mime: string) =>
  mime === 'application/pdf' ? '.pdf' : mime === 'image/png' ? '.png' : '.jpg'

/** Uploads the scan to Drive and returns its file ID. Nothing is written to the server. */
export async function uploadCertificate(
  workspaceId: string,
  file: CertificateFile,
  label: { person: string; task: string; date: string }
) {
  const config = await connectedSettings(workspaceId)
  const parent = await certificateFolder(config)
  const base = `${label.person} - ${label.task} - ${label.date}`.replace(/[\r\n\\/:*?"<>|]/g, '_').slice(0, 200)
  const metadata = {
    name: base + extension(file.mime),
    parents: [parent],
    description: `Taskwise YSO certificate. Original filename: ${file.name}`,
    appProperties: { taskwiseYsoCertificate: '1' },
  }
  const boundary = 'taskwise_' + randomBytes(12).toString('hex')
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${file.mime}\r\n\r\n`
    ),
    file.bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ])
  try {
    const saved = await driveRequest(
      config,
      'files?uploadType=multipart&supportsAllDrives=true&fields=id',
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: body as any,
      },
      true
    )
    if (!saved.id) throw new Error('missing id')
    return saved.id as string
  } catch {
    throw new CertificateError(502, 'Could not upload the scan to Google Drive. Please try again.')
  }
}

/** Fetches a certificate from Drive for a one-off download (not cached on the server). */
export async function downloadCertificate(workspaceId: string, driveFileId: string) {
  const config = await connectedSettings(workspaceId)
  const token = await oauth(config).getAccessToken()
  if (!token.token) throw new CertificateError(502, 'Reconnect Google Drive in settings')
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token.token}` }, signal: AbortSignal.timeout(45000) }
  )
  if (response.status === 404)
    throw new CertificateError(404, 'This certificate is no longer in Google Drive')
  if (!response.ok)
    throw new CertificateError(502, 'Could not fetch the certificate from Google Drive')
  return Buffer.from(await response.arrayBuffer())
}

/** Best-effort cleanup when a submission fails after its scan was uploaded. */
export async function deleteCertificate(workspaceId: string, driveFileId: string) {
  try {
    const config = await connectedSettings(workspaceId)
    await driveRequest(config, `files/${encodeURIComponent(driveFileId)}?supportsAllDrives=true`, {
      method: 'DELETE',
    })
  } catch {}
}
