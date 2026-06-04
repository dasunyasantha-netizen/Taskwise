import React, { useState, useEffect } from 'react'
import { notificationApi, webAuthnApi } from '../services/apiService'
import { startRegistration } from '@simplewebauthn/browser'

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
  const [step, setStep] = useState<'push' | 'biometric' | 'done'>('push')
  const [pushDone, setPushDone] = useState(false)
  const [biometricLoading, setBiometricLoading] = useState(false)
  const [biometricErr, setBiometricErr] = useState('')
  const [webAuthnSupported, setWebAuthnSupported] = useState(false)

  useEffect(() => {
    setWebAuthnSupported(typeof window !== 'undefined' && !!window.PublicKeyCredential)

    // Auto-request push permission immediately
    if (!('Notification' in window)) {
      setStep('biometric')
      return
    }
    if (Notification.permission === 'granted') {
      // Already granted — ensure subscribed and move on
      subscribeToWebPush().then(() => {
        setPushDone(true)
        setStep('biometric')
      }).catch(() => {
        setPushDone(true)
        setStep('biometric')
      })
      return
    }
    if (Notification.permission === 'denied') {
      setStep('biometric')
      return
    }
    // Ask now
    subscribeToWebPush().then(granted => {
      setPushDone(!!granted)
      setStep('biometric')
    }).catch(() => {
      setStep('biometric')
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSetupBiometric = async () => {
    setBiometricErr('')
    setBiometricLoading(true)
    try {
      const options = await webAuthnApi.getRegistrationOptions()
      const regResponse = await startRegistration({ optionsJSON: options as Parameters<typeof startRegistration>[0]['optionsJSON'] })
      await webAuthnApi.verifyRegistration(regResponse, 'My Device')
      finish()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Setup failed'
      if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('not allowed') || msg.toLowerCase().includes('excludecredentials')) {
        finish() // cancelled or already registered — treat as done
      } else {
        setBiometricErr(msg)
      }
    } finally {
      setBiometricLoading(false)
    }
  }

  const finish = () => {
    localStorage.setItem(`taskwise_setup_${actorId}`, '1')
    setStep('done')
    onDone()
  }

  if (step === 'push') {
    return (
      <div className="fixed inset-0 z-[9998] flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
        <div className="bg-white rounded-3xl p-7 w-full max-w-sm shadow-2xl text-center">
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-tw-primary" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </div>
          <p className="text-sm text-tw-text-secondary">Setting up notifications…</p>
        </div>
      </div>
    )
  }

  if (step === 'biometric') {
    return (
      <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0" style={{ background: 'rgba(0,0,0,0.5)' }}>
        <div className="bg-white rounded-3xl p-7 w-full max-w-sm shadow-2xl">
          {pushDone && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-5">
              <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span className="text-xs text-green-700 font-medium">Push notifications enabled</span>
            </div>
          )}

          {webAuthnSupported ? (
            <>
              <div className="text-center mb-5">
                <div className="w-16 h-16 rounded-full bg-tw-primary/10 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-8 h-8 text-tw-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
                    <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
                    <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
                    <path d="M2 12a10 10 0 0 1 18-6" />
                    <path d="M2 17.5a14.5 14.5 0 0 0 4.56 5.46" />
                    <path d="M6 10a6 6 0 0 1 11.74-1.47" />
                    <path d="M6.54 15.91C7.36 18.55 8.69 21 9.67 21" />
                    <path d="M6 10c0-.16.01-.32.01-.47" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-tw-text mb-1">Set Up Biometric Login</h3>
                <p className="text-sm text-tw-text-secondary">Sign in next time with just your fingerprint or Face ID — no password needed.</p>
              </div>

              {biometricErr && (
                <div className="bg-red-50 border border-red-200 text-tw-danger text-xs px-3 py-2 rounded-lg mb-4">
                  {biometricErr}
                </div>
              )}

              <button
                onClick={handleSetupBiometric}
                disabled={biometricLoading}
                className="w-full py-3.5 rounded-2xl bg-tw-primary text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60 mb-3"
              >
                {biometricLoading ? 'Setting up…' : 'Set Up Biometrics'}
              </button>
              <button
                onClick={finish}
                className="w-full py-2.5 rounded-2xl text-tw-text-secondary text-sm font-medium hover:bg-tw-bg transition-colors"
              >
                Skip for now
              </button>
            </>
          ) : (
            // WebAuthn not supported — just close
            <div className="text-center">
              <p className="text-sm text-tw-text-secondary mb-4">You're all set!</p>
              <button onClick={finish} className="btn-primary w-full">Continue</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}
