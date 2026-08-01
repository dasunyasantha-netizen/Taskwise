import React, { useState } from 'react'
import type { ImpersonationInfo } from '../types'
import { authApi } from '../services/apiService'

interface Props {
  impersonation: ImpersonationInfo
  targetName: string
  onExit: () => void
}

export default function ImpersonationBanner({ impersonation, targetName, onExit }: Props) {
  const [exiting, setExiting] = useState(false)

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
    <div className="fixed inset-x-0 top-0 z-[10000] bg-amber-500 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
          </div>
          <div className="min-w-0">
            <span className="text-white font-bold text-sm">Support Access</span>
            <span className="text-white/80 text-sm mx-2">·</span>
            <span className="text-white text-sm">Viewing as </span>
            <span className="text-white font-bold text-sm">{targetName}</span>
            <span className="hidden sm:inline text-white/70 text-xs ml-3">
              Expires {new Date(impersonation.expiresAt).toLocaleTimeString()}
            </span>
          </div>
        </div>

        <button
          onClick={handleExit}
          disabled={exiting}
          className="flex-shrink-0 flex items-center gap-1.5 bg-white text-amber-700 font-bold text-sm px-4 py-1.5 rounded-lg hover:bg-amber-50 active:scale-95 transition-all disabled:opacity-60"
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
