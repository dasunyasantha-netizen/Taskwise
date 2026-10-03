import { OAuth2Client } from 'google-auth-library'
import { LetterSettings } from '@prisma/client'
import { decrypt, ensure } from './letters'
export const callbackUrl = () =>
  process.env.LETTER_OAUTH_CALLBACK ||
  'https://syswise.lk/taskwise-api/api/letters/drive/callback'
// Platform-wide OAuth client (one Google Cloud app for every workspace).
// When set, admins only click Connect; Taskwise creates its own folder.
export const managedClient = () =>
  process.env.LETTER_GOOGLE_CLIENT_ID && process.env.LETTER_GOOGLE_CLIENT_SECRET
    ? {
        id: process.env.LETTER_GOOGLE_CLIENT_ID,
        secret: process.env.LETTER_GOOGLE_CLIENT_SECRET,
      }
    : null
export const driveScope = () =>
  managedClient()
    ? 'https://www.googleapis.com/auth/drive.file'
    : 'https://www.googleapis.com/auth/drive'
export function oauth(
  config: Pick<
    LetterSettings,
    'clientId' | 'encryptedSecret' | 'encryptedRefreshToken'
  >
) {
  const managed = managedClient()
  ensure(
    managed || (config.clientId && config.encryptedSecret),
    400,
    'Save Google OAuth client configuration first'
  )
  const client = managed
    ? new OAuth2Client(managed.id, managed.secret, callbackUrl())
    : new OAuth2Client(
        config.clientId!,
        decrypt(config.encryptedSecret!),
        callbackUrl()
      )
  if (config.encryptedRefreshToken)
    client.setCredentials({
      refresh_token: decrypt(config.encryptedRefreshToken),
    })
  return client
}
export async function driveRequest(
  config: LetterSettings,
  path: string,
  options: RequestInit = {},
  upload = false
) {
  const token = await oauth(config).getAccessToken()
  ensure(token.token, 502, 'Reconnect Google Drive in settings')
  const response = await fetch(
    `https://www.googleapis.com/${upload ? 'upload/' : ''}drive/v3/${path}`,
    {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token.token}` },
      signal: AbortSignal.timeout(45000),
    }
  )
  if (!response.ok) {
    // Never return Google's response bodies: they can contain account or token details.
    const error: any = new Error(
      `Google Drive returned ${response.status}. Check the connection and folder permissions.`
    )
    error.driveStatus = response.status
    throw error
  }
  return response.status === 204 ? {} : (response.json() as Promise<any>)
}
export async function verifyFolder(config: LetterSettings) {
  ensure(
    config.folderId && /^[A-Za-z0-9_-]{10,200}$/.test(config.folderId),
    400,
    'Enter a valid Drive folder ID'
  )
  const folder = await driveRequest(
    config,
    `files/${config.folderId}?supportsAllDrives=true&fields=id,name,mimeType,trashed,capabilities(canAddChildren)`
  )
  ensure(
    folder.mimeType === 'application/vnd.google-apps.folder' &&
      !folder.trashed &&
      folder.capabilities?.canAddChildren,
    400,
    'Google account needs permission to add files to this folder'
  )
  return folder.name as string
}
export async function createFolder(config: LetterSettings, name: string) {
  const folder = await driveRequest(config, 'files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  })
  return folder.id as string
}
// Reuse the saved folder when this connection can still write to it,
// otherwise create a fresh one (drive.file only sees app-created folders).
export async function ensureFolder(config: LetterSettings, name: string) {
  if (config.folderId) {
    try {
      await verifyFolder(config)
      return config.folderId
    } catch {}
  }
  return createFolder(config, name)
}
