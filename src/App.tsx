import React, { useState, useEffect } from 'react'
import type { AuthUser, ViewMode } from './types'
import { VersionBanner } from './components/VersionBanner'
import Auth from './components/Auth'
import ForcePasswordChange from './components/ForcePasswordChange'
import DirectorDashboard from './components/DirectorDashboard'
import PersonnelDashboard from './components/PersonnelDashboard'
import ImpersonationBanner from './components/ImpersonationBanner'
import SetupPrompt from './components/SetupPrompt'
import InsurancePolicyCompletionPrompt from './components/InsurancePolicyCompletionPrompt'
import { authApi, noticeApi, type Notice } from './services/apiService'
import { captureLaunchSource, type LaunchSource } from './services/launchSource'

function NoticeBanner({ loggedIn }: { loggedIn: boolean }) {
  const [notices, setNotices] = useState<Notice[]>([])

  useEffect(() => {
    if (!loggedIn) return
    noticeApi.getActive().then(setNotices).catch(() => {})
  }, [loggedIn])

  const dismiss = async (id: string) => {
    await noticeApi.dismiss(id).catch(() => {})
    setNotices(n => n.filter(x => x.id !== id))
  }

  if (notices.length === 0) return null

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] space-y-0">
      {notices.map(notice => (
        <div key={notice.id} className="bg-amber-50 border-b-2 border-amber-300 shadow-lg">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="text-amber-500 text-xl flex-shrink-0 mt-0.5">⚠️</span>
                <p className="text-sm text-amber-900 whitespace-pre-wrap leading-relaxed">{notice.message}</p>
              </div>
              <button
                onClick={() => dismiss(notice.id)}
                className="flex-shrink-0 bg-amber-400 hover:bg-amber-500 text-white font-bold text-base leading-none rounded-lg w-8 h-8 flex items-center justify-center shadow transition-colors"
                aria-label="Dismiss">
                ✕
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const TOKEN_KEY      = 'taskwise_token'
const USER_KEY       = 'taskwise_user'
const VIEW_KEY       = 'taskwise_view'
// System Admin stores the real session here during short-lived support access.
const REAL_TOKEN_KEY = 'taskwise_real_token'
const REAL_USER_KEY  = 'taskwise_real_user'

export default function App() {
  const [launchSource] = useState<LaunchSource>(() => captureLaunchSource())
  const [user, setUser]         = useState<AuthUser | null>(null)
  const [view, setView]         = useState<ViewMode>('login')
  const [loading, setLoading]   = useState(true)
  const [showSetup, setShowSetup] = useState(false)

  const persistView = (v: ViewMode) => {
    setView(v)
    if (v !== 'login') localStorage.setItem(VIEW_KEY, v)
  }

  const maybeShowSetup = (actorId: string) => {
    if (!localStorage.getItem(`taskwise_setup_${actorId}`)) {
      setShowSetup(true)
    }
  }

  useEffect(() => {
    const launchUrl = new URL(window.location.href)
    if (launchUrl.searchParams.has('source')) {
      launchUrl.searchParams.delete('source')
      window.history.replaceState({}, '', launchUrl.pathname + launchUrl.search + launchUrl.hash)
    }
    const token    = localStorage.getItem(TOKEN_KEY)
    const userData = localStorage.getItem(USER_KEY)
    if (token && userData) {
      try {
        const parsed = JSON.parse(userData) as AuthUser
        setUser(parsed)
        if (!parsed.mustChangePassword) {
          const savedView = localStorage.getItem(VIEW_KEY) as ViewMode | null
          const defaultView = parsed.actorType === 'director' ? 'director_dashboard' : 'personnel_queue'
          setView(savedView && savedView !== 'login' ? savedView : defaultView)
          maybeShowSetup(parsed.actorId)
        }
        authApi.me().then(fresh => {
          const updated = { ...parsed, ...(fresh as Partial<AuthUser>) }
          setUser(updated)
          localStorage.setItem(USER_KEY, JSON.stringify(updated))
        }).catch(() => {
          localStorage.removeItem(TOKEN_KEY)
          localStorage.removeItem(USER_KEY)
          setUser(null)
          setView('login')
        })
      } catch {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const handleSessionExpired = () => {
      const realToken = localStorage.getItem(REAL_TOKEN_KEY)
      const realUser = localStorage.getItem(REAL_USER_KEY)
      if (realToken && realUser) {
        try {
          const parsed = JSON.parse(realUser) as AuthUser
          localStorage.setItem(TOKEN_KEY, realToken)
          localStorage.setItem(USER_KEY, realUser)
          localStorage.removeItem(REAL_TOKEN_KEY)
          localStorage.removeItem(REAL_USER_KEY)
          setUser(parsed)
          setView('director_dashboard')
          return
        } catch { /* fall through to sign-out */ }
      }
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      localStorage.removeItem(VIEW_KEY)
      localStorage.removeItem(REAL_TOKEN_KEY)
      localStorage.removeItem(REAL_USER_KEY)
      setUser(null)
      setView('login')
    }
    window.addEventListener('taskwise:session-expired', handleSessionExpired)
    return () => window.removeEventListener('taskwise:session-expired', handleSessionExpired)
  }, [])

  const handleLogin = (token: string, userData: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(userData))
    setUser(userData)
    if (!userData.mustChangePassword) {
      persistView(userData.actorType === 'director' ? 'director_dashboard' : 'personnel_queue')
      maybeShowSetup(userData.actorId)
    }
  }

  const handlePasswordChanged = () => {
    setUser(prev => {
      if (!prev) return prev
      const next = { ...prev, mustChangePassword: false }
      localStorage.setItem(USER_KEY, JSON.stringify(next))
      return next
    })
    persistView('personnel_queue')
  }

  const handleLogout = async () => {
    // If in impersonation session, end it on logout
    const currentUser = user
    if (currentUser?.impersonation) {
      try { await authApi.endImpersonation('logout') } catch { /* best-effort */ }
    }
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(VIEW_KEY)
    localStorage.removeItem(REAL_TOKEN_KEY)
    localStorage.removeItem(REAL_USER_KEY)
    setUser(null)
    setView('login')
  }

  const handleUserUpdate = (updated: Partial<AuthUser>) => {
    setUser(prev => {
      if (!prev) return prev
      const next = { ...prev, ...updated }
      localStorage.setItem(USER_KEY, JSON.stringify(next))
      return next
    })
  }

  // System Admin starts support access — save real session and swap tokens.
  const handleImpersonationStart = (token: string, impersonatedUser: AuthUser) => {
    // Back up the real System Admin session.
    const realToken = localStorage.getItem(TOKEN_KEY)
    const realUser  = localStorage.getItem(USER_KEY)
    if (realToken) localStorage.setItem(REAL_TOKEN_KEY, realToken)
    if (realUser)  localStorage.setItem(REAL_USER_KEY, realUser)

    // Activate impersonation session
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(impersonatedUser))
    setUser(impersonatedUser)
    persistView('personnel_queue')
  }

  // System Admin exits support access — restore the real session.
  const handleImpersonationExit = () => {
    const realToken = localStorage.getItem(REAL_TOKEN_KEY)
    const realUser  = localStorage.getItem(REAL_USER_KEY)
    if (realToken && realUser) {
      localStorage.setItem(TOKEN_KEY, realToken)
      localStorage.setItem(USER_KEY, realUser)
      localStorage.removeItem(REAL_TOKEN_KEY)
      localStorage.removeItem(REAL_USER_KEY)
      try {
        const parsed = JSON.parse(realUser) as AuthUser
        setUser(parsed)
        persistView('director_dashboard')
      } catch {
        handleLogout()
      }
    } else {
      handleLogout()
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-tw-bg flex items-center justify-center">
        <div className="text-tw-text-secondary text-sm">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <Auth onLogin={handleLogin} />
  }

  if (user.mustChangePassword) {
    return <ForcePasswordChange user={user} onPasswordChanged={handlePasswordChanged} onLogout={handleLogout} />
  }

  const isImpersonating = !!user.impersonation
  // Add top padding when impersonation banner is shown
  const bannerPad = isImpersonating ? 'pt-11' : ''

  if (user.actorType === 'director') {
    const requiresInsurancePolicyCompletion = user.features?.includes('insurance_management') === true && !user.impersonation
    return (
      <>
        {requiresInsurancePolicyCompletion && <InsurancePolicyCompletionPrompt />}
        {showSetup && !user.impersonation && (
          <SetupPrompt actorId={user.actorId} onDone={() => setShowSetup(false)} />
        )}
        {isImpersonating && (
          <ImpersonationBanner
            impersonation={user.impersonation!}
            targetName={user.name}
            onExit={handleImpersonationExit}
          />
        )}
        <NoticeBanner loggedIn={true} />
        <div className={bannerPad}>
          <DirectorDashboard
            user={user}
            currentView={view}
            setView={persistView}
            onLogout={handleLogout}
            onUserUpdate={handleUserUpdate}
            onImpersonationStart={handleImpersonationStart}
            launchSource={launchSource}
          />
        </div>
      </>
    )
  }

  return (
    <>
      {showSetup && !user.impersonation && (
        <SetupPrompt actorId={user.actorId} onDone={() => setShowSetup(false)} />
      )}
      {isImpersonating && (
        <ImpersonationBanner
          impersonation={user.impersonation!}
          targetName={user.name}
          onExit={handleImpersonationExit}
        />
      )}
      <NoticeBanner loggedIn={true} />
      <div className={bannerPad}>
        <PersonnelDashboard
          user={user}
          currentView={view}
          setView={persistView}
          onLogout={handleLogout}
          onUserUpdate={handleUserUpdate}
          launchSource={launchSource}
        />
      </div>
      <VersionBanner />
    </>
  )
}
