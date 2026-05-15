import { precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', event => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title || 'TaskWise', {
      body: data.body || '',
      icon: data.icon || '/taskwise/icon-192.png',
      badge: '/taskwise/icon-192.png',
      vibrate: [200, 100, 200],
      tag: 'taskwise-notification',
      renotify: true,
      data: { url: '/taskwise/' },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('/taskwise/') && 'focus' in client) return client.focus()
      }
      return clients.openWindow('/taskwise/')
    })
  )
})
