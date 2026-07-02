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

// ---------------------------------------------------------------------------
// Session-expiry handling
//
// When an authenticated API call returns 401, we silently clear the user so
// the auth gate re-appears. We deliberately do NOT show a toast — the auth
// gate itself communicates "you need to sign in", and a toast was causing
// false-positive "session expired" messages during normal use. The handler is
// only "armed" AFTER fetchMe() confirms a valid session, so 401s during
// initial load (no session yet) are silently ignored.
// ---------------------------------------------------------------------------

let onSessionExpired: (() => void) | null = null
/** Only true once the app has confirmed a valid session. Prevents clearing
 *  the user during initial load when there's simply no session yet. */
let handlerArmed = false

export function registerSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler
}

/** Arm the session-expired handler — call this AFTER fetchMe() confirms a
 *  valid user. Before this, 401s are silently treated as "not signed in". */
export function armSessionHandler() {
  handlerArmed = true
}

/** Disarm — call this when the user signs out or the session expires. */
export function disarmSessionHandler() {
  handlerArmed = false
}

function handleUnauthorized() {
  // Silently clear the user — the auth gate will appear. No toast.
  if (!handlerArmed) return
  disarmSessionHandler()
  onSessionExpired?.()
}

/**
 * Thrown by `api()` on a 401 response. Callers can check
 * `err instanceof SessionExpiredError` to suppress their own error toast.
 */
export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired')
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
    if (res.status === 401) {
      // Silently handle — clears user if armed, does nothing if not armed.
      handleUnauthorized()
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

/**
 * Re-hydrate the current user from the signed session cookie.
 *
 * Uses a RAW fetch (not `api()`) so it NEVER triggers the session-expired
 * handler — a missing/invalid session during initial load is a normal "not
 * signed in" state. Returns null if there's no valid session.
 */
export async function fetchMe(): Promise<ClientUser | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    if (!res.ok) return null
    const data = (await res.json()) as { user: ClientUser | null }
    return data.user
  } catch {
    return null
  }
}

/** Sign out: clear the cookie server-side and the local cache. */
export async function signOut(): Promise<void> {
  disarmSessionHandler()
  try {
    await apiPost('/api/auth/logout')
  } catch {
    // ignore network errors — local cache is cleared regardless
  }
  setStoredUser(null)
}
