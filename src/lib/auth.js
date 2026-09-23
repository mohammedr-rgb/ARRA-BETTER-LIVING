import { useState, useCallback } from 'react'

// ── CONFIGURE THESE TWO VALUES ──────────────────────────────────────────
// 1) Create an OAuth Client ID at https://console.cloud.google.com/apis/credentials
//    → "Create Credentials" → "OAuth client ID" → Application type: "Web application"
//    → Authorized JavaScript origins: add both
//         https://mohammedr-rgb.github.io
//         http://localhost:5173   (for local dev)
//    → Copy the generated Client ID and paste it below.
export const GOOGLE_CLIENT_ID = '608602108605-kb2i76obqhnb61bcb1giil2d14m5jcrd.apps.googleusercontent.com'

// 2) Only Google accounts on this domain will be allowed in.
//    Set to null to allow ANY Google account (not recommended for this data).
export const ALLOWED_DOMAIN = 'gemedible.com'
// ─────────────────────────────────────────────────────────────────────────

export const SESSION_KEY = 'arra_auth_session_v1'

export function decodeJwt(token) {
  const payload = token.split('.')[1]
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
  const json = decodeURIComponent(
    atob(base64)
      .split('')
      .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  )
  return JSON.parse(json)
}

export function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw)
    if (!session.exp || session.exp * 1000 < Date.now()) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    return session
  } catch {
    return null
  }
}

export function getAuthToken() {
  const session = readSession()
  return session?.idToken || null
}

export function forceReauth() {
  sessionStorage.removeItem(SESSION_KEY)
  window.location.reload()
}

export function useAuth() {
  const [user, setUser] = useState(readSession)

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY)
    setUser(null)
    if (window.google?.accounts?.id) window.google.accounts.id.disableAutoSelect()
  }, [])

  return { user, setUser, logout }
}
