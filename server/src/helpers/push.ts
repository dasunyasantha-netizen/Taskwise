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
}
