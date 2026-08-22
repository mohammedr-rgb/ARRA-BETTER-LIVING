import { useState, useEffect, useRef, useCallback } from 'react'
import {
  GOOGLE_CLIENT_ID, ALLOWED_DOMAIN, SESSION_KEY, decodeJwt, useAuth,
} from '../lib/auth'

export function AuthGate({ children }) {
  const { user, setUser, logout } = useAuth()
  const [authError, setAuthError] = useState(null)
  const btnRef = useRef(null)

  const handleCredential = useCallback((response) => {
    try {
      const payload = decodeJwt(response.credential)
      if (!payload.email_verified) {
        setAuthError('Your Google account email is not verified.')
        return
      }
      if (ALLOWED_DOMAIN && payload.hd !== ALLOWED_DOMAIN) {
        setAuthError(`Access is restricted to @${ALLOWED_DOMAIN} accounts. You signed in as ${payload.email}.`)
        return
      }
      const session = {
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        exp: payload.exp,
        idToken: response.credential,
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
      setAuthError(null)
      setUser(session)
    } catch {
      setAuthError('Could not verify sign-in. Please try again.')
    }
  }, [setUser])

  useEffect(() => {
    if (user) return
    if (GOOGLE_CLIENT_ID.startsWith('YOUR_GOOGLE')) return // not configured yet

    const init = () => {
      if (!window.google?.accounts?.id) return
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredential,
      })
      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: 'filled_blue',
          size: 'large',
          shape: 'pill',
        })
      }
    }

    if (window.google?.accounts?.id) init()
    else {
      const t = setInterval(() => {
        if (window.google?.accounts?.id) { init(); clearInterval(t) }
      }, 150)
      return () => clearInterval(t)
    }
  }, [user, handleCredential])

  if (user) {
    return children({ user, logout })
  }

  const notConfigured = GOOGLE_CLIENT_ID.startsWith('YOUR_GOOGLE')

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', width: '100%', background: '#0f172a', padding: 24, textAlign: 'center', gap: 16,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>
        <span style={{ background: 'linear-gradient(135deg, #a855f7, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          ARRA BETTER LIVING
        </span>
      </div>
      <div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 8 }}>
        Sign in with your {ALLOWED_DOMAIN ? `@${ALLOWED_DOMAIN}` : 'Google'} account to continue
      </div>

      {notConfigured ? (
        <div style={{ color: '#eab308', fontSize: 13, maxWidth: 420, background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 8, padding: 16 }}>
          ⚠️ Google Sign-In isn't configured yet. Set <code>GOOGLE_CLIENT_ID</code> in <code>src/components/AuthGate.jsx</code> with a real OAuth Client ID from Google Cloud Console.
        </div>
      ) : (
        <div ref={btnRef} />
      )}

      {authError && (
        <div style={{ color: '#ef4444', fontSize: 13, maxWidth: 420, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12 }}>
          {authError}
        </div>
      )}
    </div>
  )
}

export function UserBadge({ user, logout }) {
  if (!user) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 10, background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}>
      {user.picture && <img src={user.picture} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
        <div style={{ fontSize: 10, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
      </div>
      <button onClick={logout} title="Sign out" style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, padding: 4 }}>⏻</button>
    </div>
  )
}