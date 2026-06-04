import { precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

// Bump this on every deploy — changing this string forces all PWA clients
// to install the new SW immediately, clearing old caches.
const CACHE_VERSION = '__CACHE_VERSION__'

self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)

// Delete any caches that don't belong to the current Workbox precache revision.
// This runs after activation so stale caches from previous deploys are removed.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => !k.includes(CACHE_VERSION) && k.startsWith('workbox-'))
          .map(k => caches.delete(k))
      )
    )
  )
})

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
