import webpush from 'web-push'
import prisma from '../prisma'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:admin@taskwise.app',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function sendPushToActor(
  actorId: string,
  actorType: string,
  title: string,
  message: string
) {
  try {
    const subs = await prisma.pushSubscription.findMany({
      where: { actorId, actorType }
    })
    const payload = JSON.stringify({ title, body: message, icon: '/taskwise/icon-192.png' })
    await Promise.allSettled(
      subs.map(async sub => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          )
        } catch (err: unknown) {
          // Remove expired/invalid subscriptions
          const status = (err as { statusCode?: number }).statusCode
          if (status === 410 || status === 404) {
            await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } })
          }
        }
      })
    )
  } catch { /* silent — push is best-effort */ }
  void sendToPickitiApp(actorId, actorType, title, message)
}

/**
 * The same notice on the Pickiti phone app: SysWise knows which accounts hold this
 * position and sends to their phones (only those that turned notifications on).
 */
async function sendToPickitiApp(actorId: string, actorType: string, title: string, message: string) {
  const base = process.env.SYSWISE_BASE_URL?.replace(/\/$/, '')
  const key = process.env.SYSWISE_TASKWISE_SERVICE_KEY
  if (!base || !key || !['director', 'personnel'].includes(actorType)) return
  try {
    await fetch(`${base}/api/notifications/taskwise/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': key },
      body: JSON.stringify({ actorType, actorId, title, body: message }),
      signal: AbortSignal.timeout(10000),
    })
  } catch { /* best-effort, like web push */ }
}
