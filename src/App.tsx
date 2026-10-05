import React, { useState, useEffect } from 'react'
import type { AuthUser, ViewMode } from './types'
import { VersionBanner } from './components/VersionBanner'
import Auth from './components/Auth'
import ForcePasswordChange from './components/ForcePasswordChange'
import DirectorDashboard from './components/DirectorDashboard'
import PersonnelDashboard from './components/PersonnelDashboard'
import ImpersonationBanner from './components/ImpersonationBanner'
import SetupPrompt from './components/SetupPrompt'
import MigrationContactModal from './components/MigrationContactModal'
import SyswiseCompanySelection from './components/SyswiseCompanySelection'
import InsurancePolicyCompletionPrompt from './components/InsurancePolicyCompletionPrompt'
import { authApi, noticeApi, type Notice } from './services/apiService'
import { captureLaunchSource, sharedIdentityUrl, type LaunchSource } from './services/launchSource'
import { LanguageProvider, viewingLanguage } from './i18n/Language'
import { Icon } from './components/ui/Icon'
import { LoadingBlock } from './components/ui/Primitives'
import TestCompanyBanner, { isTestCompany } from './components/TestCompanyBanner'

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
        <div key={notice.id} className="bg-amber-50 border-b border-amber-300 shadow-panel">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="icon-tile tile-amber w-8 h-8 rounded-lg flex-shrink-0"><Icon name="alert" className="w-4 h-4" /></span>
                <p className="text-sm text-amber-900 whitespace-pre-wrap leading-relaxed pt-1">{notice.message}</p>
              </div>
              <button
                onClick={() => dismiss(notice.id)}
                className="flex-shrink-0 icon-btn w-8 h-8 text-amber-800 hover:bg-amber-100"
                aria-label="Dismiss">
                <Icon name="x" className="w-4 h-4" />
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
const defaultViewFor = (u: AuthUser): ViewMode => u.actorType === 'personnel' && u.isLetterAssigner ? 'letters' : u.ysoRole === 'YSO' && u.features?.includes('four_level_hierarchy') ? 'yso_performance' : u.actorType === 'director' ? 'director_dashboard' : 'personnel_queue'
// System Admin stores the real session here during short-lived support access.
const REAL_TOKEN_KEY = 'taskwise_real_token'
const REAL_USER_KEY  = 'taskwise_real_user'

export default function App() {
  const [ssoCode, setSsoCode] = useState(() => new URLSearchParams(window.location.search).get('launch_code') || '')
  const [launchSource] = useState<LaunchSource>(() => captureLaunchSource())
  const [user, setUser]         = useState<AuthUser | null>(null)
  const [view, setView]         = useState<ViewMode>('login')
  const [loading, setLoading]   = useState(true)
  const [showSetup, setShowSetup] = useState(false)
  const [showMigration, setShowMigration] = useState(false)

  const checkMigrationContact = () => {
    authApi.migrationContact().then(result => setShowMigration(result.required)).catch(() => {})
  }

  const persistView = (v: ViewMode) => {
    setView(v)
    if (v !== 'login') localStorage.setItem(VIEW_KEY, v)
  }

  const maybeShowSetup = (actorId: string) => {
    if (actorId.startsWith('taskwise-test-')) return
    if (!localStorage.getItem(`taskwise_setup_${actorId}`)) {
      setShowSetup(true)
    }
  }

  useEffect(() => {
    const launchUrl = new URL(window.location.href)
    if (ssoCode) {
      launchUrl.searchParams.delete('launch_code')
      launchUrl.searchParams.delete('source')
      window.history.replaceState({}, '', launchUrl.pathname + launchUrl.search + launchUrl.hash)
      for (const key of [TOKEN_KEY, USER_KEY, VIEW_KEY, REAL_TOKEN_KEY, REAL_USER_KEY]) localStorage.removeItem(key)
      setLoading(false)
      return
    }
    // A direct app/PWA launch also uses the shared platform account. The
    // role-testing sandbox and the public company request form are exempt.
    if (!['testing', 'company-request'].some(p => launchUrl.searchParams.has(p)) && localStorage.getItem('syswise_token') && !localStorage.getItem(REAL_TOKEN_KEY)) {
      const origin = window.location.hostname === 'localhost' ? 'http://localhost:3100' : window.location.origin
      window.location.replace(`${origin}/sso/taskwise?source=${launchSource}`)
      return
    }
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
          const defaultView = defaultViewFor(parsed)
          setView(savedView && savedView !== 'login' ? savedView : defaultView)
          if (!parsed.impersonation) maybeShowSetup(parsed.actorId)
        }
        authApi.me().then(fresh => {
          if (localStorage.getItem(TOKEN_KEY) !== token) return
          const updated = { ...parsed, ...(fresh as Partial<AuthUser>) }
          setUser(updated)
          localStorage.setItem(USER_KEY, JSON.stringify(updated))
          if (!updated.mustChangePassword && !updated.impersonation) checkMigrationContact()
        }).catch(() => {
          // The API handler restores the admin after a support session expires.
          // Do not overwrite that restored session with this stale request.
          if (localStorage.getItem(TOKEN_KEY) !== token) return
          localStorage.removeItem(TOKEN_KEY)
          localStorage.removeItem(USER_KEY)
          setUser(null)
          setView('login')
          if (parsed.syswiseUserId) window.location.replace(sharedIdentityUrl('login', 'pickiti'))
        })
      } catch {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const handleSessionExpired = (event: Event) => {
      const realToken = localStorage.getItem(REAL_TOKEN_KEY)
      const realUser = localStorage.getItem(REAL_USER_KEY)
      if ((event as CustomEvent).detail?.support && realToken && realUser) {
        try {
          const parsed = JSON.parse(realUser) as AuthUser
          localStorage.setItem(TOKEN_KEY, realToken)
          localStorage.setItem(USER_KEY, realUser)
          localStorage.removeItem(REAL_TOKEN_KEY)
          localStorage.removeItem(REAL_USER_KEY)
          setUser(parsed)
          persistView('impersonation')
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
      if ((event as CustomEvent).detail?.syswise) window.location.replace(sharedIdentityUrl('login', 'pickiti'))
    }
    const handleSharedSignOut = (event: StorageEvent) => {
      if (event.newValue === null && (event.key === 'syswise_token' || event.key === TOKEN_KEY)) {
        // Shared logout must never resurrect the saved administrator session.
        localStorage.removeItem(REAL_TOKEN_KEY)
        localStorage.removeItem(REAL_USER_KEY)
        handleSessionExpired(new CustomEvent('taskwise:session-expired', { detail: { syswise: true } }))
      }
    }
    window.addEventListener('taskwise:session-expired', handleSessionExpired)
    window.addEventListener('storage', handleSharedSignOut)
    return () => {
      window.removeEventListener('taskwise:session-expired', handleSessionExpired)
      window.removeEventListener('storage', handleSharedSignOut)
    }
  }, [])

  const handleLogin = (token: string, userData: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(userData))
    setUser(userData)
    if (!userData.mustChangePassword) {
      persistView(defaultViewFor(userData))
      maybeShowSetup(userData.actorId)
      if (!userData.impersonation) checkMigrationContact()
    }
  }

  const handlePasswordChanged = () => {
    setUser(prev => {
      if (!prev) return prev
      const next = { ...prev, mustChangePassword: false }
      localStorage.setItem(USER_KEY, JSON.stringify(next))
      return next
    })
    persistView(user ? defaultViewFor(user) : 'personnel_queue')
    checkMigrationContact()
  }

  const handleLogout = async () => {
    // If in impersonation session, end it on logout
    const currentUser = user
    let sharedSession = !!currentUser?.syswiseUserId
    try { sharedSession ||= !!JSON.parse(localStorage.getItem(REAL_USER_KEY) || '{}').syswiseUserId } catch { /* invalid cached support session */ }
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
    setShowMigration(false)
    if (sharedSession) window.location.replace(sharedIdentityUrl('logout', launchSource))
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
    persistView(defaultViewFor(impersonatedUser))
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
        <LoadingBlock />
      </div>
    )
  }

  if (!user) {
    if (ssoCode) return <SyswiseCompanySelection code={ssoCode} onLogin={(token, selected) => { setSsoCode(''); handleLogin(token, selected) }} />
    return <Auth onLogin={handleLogin} />
  }

  if (user.mustChangePassword) {
    return <ForcePasswordChange user={user} onPasswordChanged={handlePasswordChanged} onLogout={handleLogout} />
  }

  const isImpersonating = !!user.impersonation
  // Add top padding when impersonation banner is shown
  const bannerPad = isTestCompany(user) ? 'test-company-shell' : isImpersonating ? 'pt-[56px]' : ''

  if (user.actorType === 'director') {
    const requiresInsurancePolicyCompletion = user.features?.includes('insurance_management') === true && !user.impersonation
    return (
      <LanguageProvider language={viewingLanguage(user)}>
        {isTestCompany(user) && <TestCompanyBanner user={user} view={view} />}
        {showMigration && !user.impersonation && <MigrationContactModal currentPhone={user.phone} onSaved={() => setShowMigration(false)} />}
        {requiresInsurancePolicyCompletion && <InsurancePolicyCompletionPrompt />}
        {showSetup && !showMigration && !user.impersonation && (
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
          {/* Remount per identity so Support Access never shows the previous account's data */}
          <DirectorDashboard
            key={`${user.actorType}:${user.actorId}:${user.workspaceId}`}
            user={user}
            currentView={view}
            setView={persistView}
            onLogout={handleLogout}
            onUserUpdate={handleUserUpdate}
            onImpersonationStart={handleImpersonationStart}
            launchSource={launchSource}
          />
        </div>
      </LanguageProvider>
    )
  }

  return (
    <LanguageProvider language={viewingLanguage(user)}>
      {isTestCompany(user) && <TestCompanyBanner user={user} view={view} />}
      {showMigration && !user.impersonation && <MigrationContactModal currentPhone={user.phone} onSaved={() => setShowMigration(false)} />}
      {showSetup && !showMigration && !user.impersonation && (
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
          key={`${user.actorType}:${user.actorId}:${user.workspaceId}`}
          user={user}
          currentView={view}
          setView={persistView}
          onLogout={handleLogout}
          onUserUpdate={handleUserUpdate}
          launchSource={launchSource}
        />
      </div>
      <VersionBanner />
    </LanguageProvider>
  )
}
