import { useState, useEffect } from 'react'

const GOOGLE_CLIENT_ID = '608602108605-kb2i76obqhnb61bcb1giil2d14m5jcrd.apps.googleusercontent.com'

// Access control. If both lists are empty, any Google account is allowed.
const ALLOWED_DOMAINS = ['gemedible.com']
const ALLOWED_EMAILS = []

const SESSION_KEY = 'arra_dashboard_session_v1'

function decodeJWT(token) {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s.exp || s.exp * 1000 < Date.now()) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    return s
  } catch {
    return null
  }
}

function isAllowed(payload) {
  if (!payload || !payload.email) return false
  const email = String(payload.email).toLowerCase()
  if (ALLOWED_EMAILS.length && ALLOWED_EMAILS.some(e => email === e.toLowerCase())) return true
  if (ALLOWED_DOMAINS.length && ALLOWED_DOMAINS.some(d => email.endsWith('@' + d.toLowerCase()))) return true
  return ALLOWED_EMAILS.length === 0 && ALLOWED_DOMAINS.length === 0
}

export default function AuthGate({ children }) {
  const [user, setUser] = useState(loadSession)
  const [googleReady, setGoogleReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const init = () => {
      const g = window.google && window.google.accounts && window.google.accounts.id
      if (!g) return false
      g.initialize({
        client_id: GOOGLE_CLIENT_ID,
        cancel_on_tap_outside: false,
        callback: (resp) => {
          if (!resp || !resp.credential) {
            setError('Sign-in was dismissed. Please try again.')
            return
          }
          const payload = decodeJWT(resp.credential)
          if (!isAllowed(payload)) {
            setError(`Access restricted — ${payload && payload.email ? payload.email : 'this account'} is not authorized.`)
            return
          }
          const session = { email: payload.email, name: payload.name || '', picture: payload.picture || '', exp: payload.exp }
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
          setUser(session)
          setError(null)
        },
      })
      const el = document.getElementById('google-signin-btn')
      if (el && !el.dataset.gsiRendered) {
        g.renderButton(el, { theme: 'outline', size: 'large', shape: 'pill', width: 260, text: 'signin_with' })
        el.dataset.gsiRendered = '1'
      }
      setGoogleReady(true)
      return true
    }
    if (init()) return
    const t = setInterval(() => { if (init()) clearInterval(t) }, 300)
    return () => clearInterval(t)
  }, [])

  const signOut = () => {
    sessionStorage.removeItem(SESSION_KEY)
    const g = window.google && window.google.accounts && window.google.accounts.id
    if (g && typeof g.disableAutoSelect === 'function') g.disableAutoSelect()
    setUser(null)
    setError(null)
  }

  if (user) {
    return (
      <>
        <div style={{ position: 'fixed', top: 14, right: 14, zIndex: 1000, display: 'flex', alignItems: 'center', gap: 10, background: '#1e293b', border: '1px solid #334155', borderRadius: 20, padding: '6px 8px 6px 6px', boxShadow: '0 4px 16px rgba(0,0,0,0.35)' }}>
          {user.picture ? (
            <img src={user.picture} alt="" style={{ width: 26, height: 26, borderRadius: '50%' }} />
          ) : (
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(59,130,246,0.2)', color: '#60a5fa', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{(user.email || '?')[0].toUpperCase()}</span>
          )}
          <span style={{ fontSize: 12, color: '#f1f5f9', maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</span>
          <button onClick={signOut} style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 16, padding: '4px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
        {children}
      </>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: '36px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: 34, marginBottom: 12 }}>✦</div>
        <div style={{ fontSize: 20, fontWeight: 700, background: 'linear-gradient(135deg, #a855f7, #3b82f6)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', marginBottom: 6 }}>
          ARRA BETTER LIVING
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 28 }}>Sales dashboard — sign in with your Google account to continue</div>
        <div id="google-signin-btn" style={{ display: 'flex', justifyContent: 'center' }} />
        {error && <div style={{ marginTop: 14, fontSize: 12, color: '#ef4444', lineHeight: 1.5 }}>{error}</div>}
        {!googleReady && <div style={{ marginTop: 16, fontSize: 12, color: '#64748b' }}>Loading Google sign-in…</div>}
      </div>
    </div>
  )
}