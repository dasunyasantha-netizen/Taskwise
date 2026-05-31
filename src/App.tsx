import React, { useState, useEffect } from 'react'
import type { AuthUser, ViewMode } from './types'
import Auth from './components/Auth'
import ForcePasswordChange from './components/ForcePasswordChange'
import DirectorDashboard from './components/DirectorDashboard'
import PersonnelDashboard from './components/PersonnelDashboard'
import { authApi, noticeApi, type Notice } from './services/apiService'

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

const TOKEN_KEY = 'taskwise_token'
const USER_KEY  = 'taskwise_user'

export default function App() {
  const [user, setUser]         = useState<AuthUser | null>(null)
  const [view, setView]         = useState<ViewMode>('login')
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    const token    = localStorage.getItem(TOKEN_KEY)
    const userData = localStorage.getItem(USER_KEY)
    if (token && userData) {
      try {
        const parsed = JSON.parse(userData) as AuthUser
        // Show cached user immediately so the app feels instant
        setUser(parsed)
        if (!parsed.mustChangePassword) {
          setView(parsed.actorType === 'director' ? 'director_dashboard' : 'personnel_queue')
        }
        // Refresh from server to pick up any workspace changes (name, logo, etc.)
        authApi.me().then(fresh => {
          const updated = { ...parsed, ...(fresh as Partial<AuthUser>) }
          setUser(updated)
          localStorage.setItem(USER_KEY, JSON.stringify(updated))
        }).catch(() => {
          // Token invalid/expired — force logout
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

  const handleLogin = (token: string, userData: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(userData))
    setUser(userData)
    // Gate on mustChangePassword before allowing into the app
    if (!userData.mustChangePassword) {
      setView(userData.actorType === 'director' ? 'director_dashboard' : 'personnel_queue')
    }
  }

  const handlePasswordChanged = () => {
    // Clear the flag and enter the app
    setUser(prev => {
      if (!prev) return prev
      const next = { ...prev, mustChangePassword: false }
      localStorage.setItem(USER_KEY, JSON.stringify(next))
      return next
    })
    setView('personnel_queue')
  }

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
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

  if (user.actorType === 'director') {
    return (
      <>
        <NoticeBanner loggedIn={true} />
        <DirectorDashboard
          user={user}
          currentView={view}
          setView={setView}
          onLogout={handleLogout}
          onUserUpdate={handleUserUpdate}
        />
      </>
    )
  }

  return (
    <>
      <NoticeBanner loggedIn={true} />
      <PersonnelDashboard
        user={user}
        currentView={view}
        setView={setView}
        onLogout={handleLogout}
        onUserUpdate={handleUserUpdate}
      />
    </>
  )
}
