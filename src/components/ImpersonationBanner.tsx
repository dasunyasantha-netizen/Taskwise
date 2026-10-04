import React, { useEffect, useState } from 'react'
import type { ImpersonationInfo } from '../types'
import { authApi } from '../services/apiService'

interface Props {
  impersonation: ImpersonationInfo
  targetName: string
  onExit: () => void
}

export default function ImpersonationBanner({ impersonation, targetName, onExit }: Props) {
  const [exiting, setExiting] = useState(false)

  // Expose the banner height so fixed overlays (modals) can sit below it
  useEffect(() => {
    document.documentElement.style.setProperty('--tw-banner-h', '56px')
    return () => { document.documentElement.style.removeProperty('--tw-banner-h') }
  }, [])

  const handleExit = async () => {
    if (exiting) return
    setExiting(true)
    try {
      await authApi.endImpersonation('exit')
    } catch {
      // Best-effort — exit regardless
    }
    onExit()
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[10000] h-[56px] border-b border-amber-200 bg-amber-50 shadow-sm">
      <div className="max-w-[1440px] h-full mx-auto px-4 flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="hidden sm:flex flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 items-center justify-center">
            <svg className="w-4 h-4 text-amber-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
          </div>
          <div className="min-w-0 truncate" title={`Support Access · Viewing as ${targetName}`}>
            <span className="hidden sm:inline text-amber-900 font-bold text-sm">Support Access</span>
            <span className="hidden sm:inline text-amber-600 text-sm mx-2">·</span>
            <span className="text-amber-900 text-sm">Viewing as </span>
            <span className="text-amber-900 font-bold text-sm">{targetName}</span>
            <span className="hidden sm:inline text-amber-800 text-xs ml-3">
              Expires {new Date(impersonation.expiresAt).toLocaleTimeString()}
            </span>
          </div>
        </div>

        <button
          onClick={handleExit}
          disabled={exiting}
          className="flex-shrink-0 flex min-h-10 items-center gap-1.5 border border-amber-200 bg-white text-amber-900 font-bold text-sm px-3 sm:px-4 py-2 rounded-lg hover:bg-amber-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800 disabled:opacity-60"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
          {exiting ? 'Exiting…' : 'Exit View'}
        </button>
      </div>
    </div>
  )
}
