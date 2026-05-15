import { useState, useEffect } from 'react'
import { notificationApi } from '../services/apiService'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Capture the event at module load time — it can fire before React mounts
let _cachedPrompt: BeforeInstallPromptEvent | null = null
window.addEventListener('beforeinstallprompt', (e: Event) => {
  e.preventDefault()
  _cachedPrompt = e as BeforeInstallPromptEvent
})

export function usePWA() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(_cachedPrompt)
  const [isInstalled, setIsInstalled]     = useState(false)
  const [pushEnabled, setPushEnabled]     = useState(false)

  // iOS Safari never fires beforeinstallprompt — detect it separately
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)

  useEffect(() => {
    if (isInStandaloneMode) setIsInstalled(true)

    // Also listen for late-firing events (some browsers delay it)
    const handler = (e: Event) => {
      e.preventDefault()
      _cachedPrompt = e as BeforeInstallPromptEvent
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => { setIsInstalled(true); setInstallPrompt(null) })
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    if (!('Notification' in window)) return
    if (Notification.permission === 'granted') setPushEnabled(true)
  }, [])

  const installApp = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setIsInstalled(true)
    _cachedPrompt = null
    setInstallPrompt(null)
  }

  const enablePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return false

      const reg = await navigator.serviceWorker.ready
      const vapidRes = await notificationApi.getVapidKey()
      const publicKey = (vapidRes as { publicKey: string }).publicKey

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })

      await notificationApi.savePushSubscription(sub.toJSON())
      setPushEnabled(true)
      return true
    } catch (e) {
      console.error('Push subscription failed', e)
      return false
    }
  }

  const canInstall = !isInstalled && (installPrompt !== null || isIOS)

  return { installPrompt, isInstalled, isIOS, canInstall, installApp, pushEnabled, enablePush }
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const arr = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i)
  return arr.buffer
}
