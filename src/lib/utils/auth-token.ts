/**
 * ?? token ?? ? ?? sessionStorage ??
 *
 * v5B: ? localStorage ??? sessionStorage??? XSS ???
 * - sessionStorage ???????????
 * - ?? localStorage ????????
 * - ????? httpOnly cookie ?????
 */

const TOKEN_KEY = 'token'
const USER_KEY = 'user'

export function getAuthToken(): string {
  if (typeof window === 'undefined') return ''
  return sessionStorage.getItem(TOKEN_KEY) || ''
}

export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function removeAuthToken(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(TOKEN_KEY)
}

export function getAuthUser(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setAuthUser(user: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function removeAuthUser(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(USER_KEY)
}

/** ???? localStorage ?? token?????? sessionStorage ??? */
export function migrateFromLegacyStorage(): void {
  if (typeof window === 'undefined') return
  const legacyToken = localStorage.getItem(TOKEN_KEY)
  if (legacyToken && !sessionStorage.getItem(TOKEN_KEY)) {
    sessionStorage.setItem(TOKEN_KEY, legacyToken)
    const legacyUser = localStorage.getItem(USER_KEY)
    if (legacyUser) sessionStorage.setItem(USER_KEY, legacyUser)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }
}
