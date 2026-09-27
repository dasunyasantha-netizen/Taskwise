import { AuthPayload } from '../middleware/authMiddleware'
import { Prisma } from '@prisma/client'
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto'
export type DB = Prisma.TransactionClient
export class LetterError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}
export function ensure(
  ok: unknown,
  status: number,
  message: string
): asserts ok {
  if (!ok) throw new LetterError(status, message)
}
export const actorKey = (a: AuthPayload) => `${a.actorType}:${a.actorId}`
export const today = (at = new Date()) =>
  new Date(at.getTime() + 19800000).toISOString().slice(0, 10)
export const days = (from: string, to: string) =>
  Math.max(
    0,
    Math.floor(
      (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) /
        86400000
    )
  )
export const sha = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex')
export function text(
  value: unknown,
  label: string,
  max = 300,
  required = true
) {
  ensure(
    typeof value === 'string' || (!required && value == null),
    400,
    `${label} is required`
  )
  const v = String(value ?? '').trim()
  ensure(
    (!required || v.length > 0) && v.length <= max,
    400,
    `${label} must contain ${required ? '1' : '0'}–${max} characters`
  )
  return v
}
export function date(value: unknown, label: string) {
  const v = text(value, label, 10)
  ensure(
    /^20\d\d-\d\d-\d\d$/.test(v) &&
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v &&
      v <= today(),
    400,
    `${label} must be a valid date, no later than today`
  )
  return v
}
export async function scope(db: DB, actor: AuthPayload) {
  const workspace = await db.workspace.findUnique({
    where: { id: actor.workspaceId },
    include: { company: { select: { status: true, prefix: true } } },
  })
  ensure(
    workspace && (!workspace.company || workspace.company.status === 'ACTIVE'),
    403,
    'Active workspace required'
  )
  const member =
    actor.actorType === 'director'
      ? await db.director.findFirst({
          where: {
            id: actor.actorId,
            workspaceId: actor.workspaceId,
            isActive: true,
          },
        })
      : await db.personnel.findFirst({
          where: {
            id: actor.actorId,
            workspaceId: actor.workspaceId,
            isActive: true,
            deletedAt: null,
          },
        })
  ensure(member, 403, 'Active workspace membership required')
  return {
    key: actorKey(actor),
    name: member.name,
    director: actor.actorType === 'director',
    logger:
      actor.actorType === 'director' ||
      ('isLetterLogger' in member && member.isLetterLogger === true),
    prefix: workspace.company?.prefix || 'TW',
  }
}
export type LetterScope = Awaited<ReturnType<typeof scope>>
export function visibility(
  workspaceId: string,
  s: LetterScope
): Prisma.LetterThreadWhereInput {
  return {
    workspaceId,
    ...(!s.logger
      ? {
          OR: [
            { createdBy: s.key },
            { assignedTo: s.key },
            { access: { some: { actorKey: s.key } } },
          ],
        }
      : {}),
  }
}
export async function memberByKey(db: DB, workspaceId: string, key: string) {
  const [type, id, extra] = key.split(':')
  ensure(
    id && !extra && ['director', 'personnel'].includes(type),
    400,
    'Choose a valid assignee'
  )
  const m =
    type === 'director'
      ? await db.director.findFirst({
          where: { id, workspaceId, isActive: true },
        })
      : await db.personnel.findFirst({
          where: { id, workspaceId, isActive: true, deletedAt: null },
        })
  ensure(m, 400, 'Assignee must be active in this workspace')
  return { key, name: m.name }
}
export async function notify(
  db: DB,
  workspaceId: string,
  key: string,
  threadId: string,
  reference: string,
  message: string
) {
  const [type, id] = key.split(':')
  await db.notification.create({
    data: {
      workspaceId,
      recipientType: type,
      ...(type === 'director'
        ? { recipientDirectorId: id }
        : { recipientPersonnelId: id }),
      type: 'letter_update',
      title: reference,
      message,
      payload: { threadId, reference },
    },
  })
}
export function files(value: unknown) {
  ensure(
    Array.isArray(value) && value.length <= 4,
    400,
    'Attach up to 4 PDF, PNG or JPEG files'
  )
  let total = 0
  return value.map((f: any) => {
    const name = text(f.name, 'Filename', 180).replace(
      /[\\/\r\n\x00-\x1f]/g,
      '_'
    )
    ensure(
      typeof f.base64 === 'string' &&
        f.base64.length <= 5600000 &&
        /^[A-Za-z0-9+/]*={0,2}$/.test(f.base64),
      400,
      'Invalid file data'
    )
    const original = Buffer.from(f.base64, 'base64')
    total += original.length
    ensure(
      original.length > 0 &&
        original.length <= 4 * 1024 * 1024 &&
        total <= 8 * 1024 * 1024,
      400,
      'Files must be at most 4 MB each and 8 MB combined'
    )
    const mime =
      original.subarray(0, 5).toString() === '%PDF-'
        ? 'application/pdf'
        : original
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? 'image/png'
          : original[0] === 255 && original[1] === 216 && original[2] === 255
            ? 'image/jpeg'
            : ''
    ensure(mime, 400, 'Only PDF, PNG and JPEG documents are supported')
    return {
      name,
      original,
      size: original.length,
      mime,
      sha256: sha(original),
    }
  })
}
function encryptionKey() {
  const value = process.env.LETTER_ENCRYPTION_KEY || ''
  ensure(
    /^[a-fA-F0-9]{64}$/.test(value),
    503,
    'Drive encryption key is not configured on the server'
  )
  return Buffer.from(value, 'hex')
}
export const encryptionReady = () =>
  /^[a-fA-F0-9]{64}$/.test(process.env.LETTER_ENCRYPTION_KEY || '')
export function encrypt(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data]
    .map((b) => b.toString('base64'))
    .join('.')
}
export function decrypt(value: string) {
  const [iv, tag, data] = value.split('.').map((v) => Buffer.from(v, 'base64'))
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv)
  cipher.setAuthTag(tag)
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8')
}
