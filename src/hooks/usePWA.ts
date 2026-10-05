import { useState, useEffect } from 'react'
import { notificationApi } from '../services/apiService'
import { currentLaunchSource } from '../services/launchSource'

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

export type PushState = 'on' | 'off' | 'blocked' | 'unsupported'

const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const PROMPTED_KEY = 'tw_push_prompted'

/**
 * Push notifications are on by default: if the browser already allows them the
 * device is (re)subscribed silently on every visit; otherwise permission is
 * requested once, on the user's first tap. Never during support access, so an
 * admin's device is not subscribed to the viewed user's notifications.
 */
export function usePWA({ autoPush = true }: { autoPush?: boolean } = {}) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(_cachedPrompt)
  const [isInstalled, setIsInstalled]     = useState(false)
  const [pushEnabled, setPushEnabled]     = useState(false)
  const [pushState, setPushState]         = useState<PushState>(() =>
    !pushSupported() ? 'unsupported' : Notification.permission === 'denied' ? 'blocked' : 'off')

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


  const installApp = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setIsInstalled(true)
    _cachedPrompt = null
    setInstallPrompt(null)
  }

  const subscribe = async () => {
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      const vapidRes = await notificationApi.getVapidKey()
      const publicKey = (vapidRes as { publicKey: string }).publicKey
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
    }
    // Upsert by endpoint: also moves this device to whoever is signed in now.
    await notificationApi.savePushSubscription(sub.toJSON())
    setPushEnabled(true)
    setPushState('on')
  }

  const enablePush = async () => {
    if (!pushSupported() || !autoPush) return false
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setPushState(permission === 'denied' ? 'blocked' : 'off')
        return false
      }
      await subscribe()
      return true
    } catch (e) {
      console.error('Push subscription failed', e)
      return false
    }
  }

  useEffect(() => {
    if (!pushSupported() || !autoPush) return
    if (Notification.permission === 'granted') {
      subscribe().catch(e => console.error('Push subscription failed', e))
      return
    }
    if (Notification.permission !== 'default') return
    try { if (localStorage.getItem(PROMPTED_KEY)) return } catch { /* storage unavailable */ }
    // Browsers only show the permission prompt in response to a user gesture.
    const onFirstTap = () => {
      try { localStorage.setItem(PROMPTED_KEY, '1') } catch { /* storage unavailable */ }
      void enablePush()
    }
    window.addEventListener('pointerup', onFirstTap, { once: true })
    return () => window.removeEventListener('pointerup', onFirstTap)
  }, [autoPush]) // eslint-disable-line react-hooks/exhaustive-deps

  // Opened from Pickiti: Pickiti is the app to install, so TaskWise does not offer itself.
  const canInstall = !isInstalled && currentLaunchSource() !== 'pickiti' && (installPrompt !== null || isIOS)

  return { installPrompt, isInstalled, isIOS, canInstall, installApp, pushEnabled, pushState, enablePush }
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const arr = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i)
  return arr.buffer
}
