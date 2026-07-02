'use client'

import type { ClientUser } from '@/lib/types'

const STORAGE_KEY = 'codesync-user'

/**
 * The user object is cached in localStorage purely for instant UI hydration.
 * The source of truth is the signed httpOnly session cookie set by
 * /api/users POST — the client cannot read or forge it. Every API request is
 * authenticated via `credentials: 'include'`, never via a client-supplied
 * header.
 */
export function getStoredUser(): ClientUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ClientUser) : null
  } catch {
    return null
  }
}

export function setStoredUser(u: ClientUser | null) {
  if (typeof window === 'undefined') return
  if (u) localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
  else localStorage.removeItem(STORAGE_KEY)
}

/**
 * Callback invoked when any API call returns 401 (session expired / invalid).
 * Registered by the app shell (page.tsx) so we can clear the stale local user
 * and bounce back to the auth gate with a clear message — instead of every
 * individual call site showing a cryptic "Unauthorized" toast.
 */
let onSessionExpired: (() => void) | null = null

export function registerSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler
}

// Debounce: a single expired session can trigger many simultaneous 401s; only
// fire the handler once.
let sessionExpiredFired = false
function fireSessionExpired() {
  if (sessionExpiredFired) return
  sessionExpiredFired = true
  onSessionExpired?.()
  // reset after a short delay so a future re-sign-in can expire again
  setTimeout(() => {
    sessionExpiredFired = false
  }, 2000)
}

/**
 * Thrown by `api()` on a 401 response. Callers can check
 * `err instanceof SessionExpiredError` to suppress their own error toast —
 * the global session-expired handler already shows a single clear message and
 * returns the user to the auth gate.
 */
export class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired')
    this.name = 'SessionExpiredError'
  }
}

/** True if an error is a session-expiry (401) — callers should skip toasting. */
export function isSessionExpiredError(err: unknown): boolean {
  return err instanceof SessionExpiredError
}

export async function api<T = unknown>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const headers = new Headers(opts.headers)
  if (!headers.has('content-type') && opts.body) {
    headers.set('content-type', 'application/json')
  }

  const res = await fetch(path, {
    ...opts,
    headers,
    credentials: 'include', // send the httpOnly session cookie
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    // On 401, the session is gone (expired cookie, server restart, etc.).
    // Fire the global handler once (clears user + shows a single toast) and
    // throw a SessionExpiredError so callers can skip their own redundant toast.
    if (res.status === 401) {
      fireSessionExpired()
      throw new SessionExpiredError()
    }
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return data as T
}

export const apiGet = <T = unknown>(path: string) => api<T>(path)
export const apiPost = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
export const apiPut = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined })
export const apiPatch = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined })
export const apiDel = <T = unknown>(path: string) => api<T>(path, { method: 'DELETE' })

/** Re-hydrate the current user from the signed session cookie. */
export async function fetchMe(): Promise<ClientUser | null> {
  try {
    const res = await api<{ user: ClientUser | null }>('/api/auth/me')
    return res.user
  } catch {
    return null
  }
}

/** Sign out: clear the cookie server-side and the local cache. */
export async function signOut(): Promise<void> {
  try {
    await apiPost('/api/auth/logout')
  } catch {
    // ignore network errors — local cache is cleared regardless
  }
  setStoredUser(null)
}
