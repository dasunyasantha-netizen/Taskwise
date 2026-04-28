import React, { useState, useEffect } from 'react'
import type { AuthUser, ViewMode } from './types'
import Auth from './components/Auth'
import ForcePasswordChange from './components/ForcePasswordChange'
import DirectorDashboard from './components/DirectorDashboard'
import PersonnelDashboard from './components/PersonnelDashboard'

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
        setUser(parsed)
        // mustChangePassword users stay gated — don't navigate to dashboard
        if (!parsed.mustChangePassword) {
          setView(parsed.actorType === 'director' ? 'director_dashboard' : 'personnel_queue')
        }
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

  // First login gate — must change password before entering the app
  if (user.mustChangePassword) {
    return (
      <ForcePasswordChange
        user={user}
        onPasswordChanged={handlePasswordChanged}
        onLogout={handleLogout}
      />
    )
  }

  if (user.actorType === 'director') {
    return (
      <DirectorDashboard
        user={user}
        currentView={view}
        setView={setView}
        onLogout={handleLogout}
        onUserUpdate={handleUserUpdate}
      />
    )
  }

  return (
    <PersonnelDashboard
      user={user}
      currentView={view}
      setView={setView}
      onLogout={handleLogout}
      onUserUpdate={handleUserUpdate}
    />
  )
}
