import React, { useState, useEffect } from 'react'
import { notificationApi } from '../services/apiService'

interface Props {
  actorId: string
  onDone: () => void
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const arr = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i)
  return arr.buffer
}

async function subscribeToWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false
  const reg = await navigator.serviceWorker.ready
  const vapidRes = await notificationApi.getVapidKey() as { publicKey: string }
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidRes.publicKey),
  })
  await notificationApi.savePushSubscription(sub.toJSON())
  return true
}

export default function SetupPrompt({ actorId, onDone }: Props) {
  // Sign-in (including passkeys) belongs to Pickiti, so first-run setup only
  // enables push notifications.
  const [step, setStep] = useState<'push' | 'done'>('push')

  useEffect(() => {
    // Auto-request push permission immediately
    if (!('Notification' in window)) {
      finish()
      return
    }
    if (Notification.permission === 'granted') {
      // Already granted — ensure subscribed and move on
      subscribeToWebPush().catch(() => false).finally(finish)
      return
    }
    if (Notification.permission === 'denied') {
      finish()
      return
    }
    // Ask now
    subscribeToWebPush().catch(() => false).finally(finish)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const finish = () => {
    localStorage.setItem(`taskwise_setup_${actorId}`, '1')
    setStep('done')
    onDone()
  }

  if (step === 'push') {
    return (
      <div className="fixed inset-0 z-[9998] flex items-center justify-center px-4 bg-[#0b1220]/50 backdrop-blur-[3px] animate-fade-in">
        <div className="modal-panel p-7 w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl icon-tile tile-blue mx-auto mb-4">
            <svg className="w-8 h-8 text-tw-primary" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </div>
          <p className="text-sm text-tw-text-secondary">Setting up notifications…</p>
          <button onClick={finish} className="mt-4 text-sm text-tw-text-secondary hover:underline">Skip for now</button>
        </div>
      </div>
    )
  }

  return null
}
