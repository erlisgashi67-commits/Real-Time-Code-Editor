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

// The handler may be async (it re-checks the session via fetchMe). The union
// return type lets handleUnauthorized() correctly await / .finally() it.
type SessionExpiredHandler = () => void | Promise<void>

let onSessionExpired: SessionExpiredHandler | null = null
/** Only true once the app has confirmed a valid session. Prevents clearing
 *  the user during initial load when there's simply no session yet. */
let handlerArmed = false

export function registerSessionExpiredHandler(handler: SessionExpiredHandler | null) {
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

// Debounce: multiple simultaneous 401s (e.g. dashboard + chat + comments all
// failing at once) should only trigger ONE re-check, not N.
let unauthorizedCheckInProgress = false
function handleUnauthorized() {
  if (!handlerArmed) return
  if (unauthorizedCheckInProgress) return
  unauthorizedCheckInProgress = true
  disarmSessionHandler()
  // Fire the handler (which re-checks the session via fetchMe). It may be
  // async — if so, reset the debounce flag when it settles; otherwise reset
  // after a short delay.
  const result = onSessionExpired?.()
  if (result instanceof Promise) {
    result.finally(() => {
      unauthorizedCheckInProgress = false
    })
  } else {
    setTimeout(() => { unauthorizedCheckInProgress = false }, 1000)
  }
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
  // Parse JSON defensively — the server might return an empty body (204) or a
  // non-JSON error page (e.g. a proxy 502). In those cases `data` is null so
  // the error path below falls back to a status-code message.
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      // Non-JSON response (HTML error page, plain text). Use the raw text as
      // the error message if the request failed; otherwise return null.
      data = null
    }
  }
  if (!res.ok) {
    if (res.status === 401) {
      // Silently handle — clears user if armed, does nothing if not armed.
      handleUnauthorized()
      throw new SessionExpiredError()
    }
    const msg =
      (data && typeof data === 'object' && ('error' in data || 'message' in data)
        ? ((data as { error?: string; message?: string }).error || (data as { message?: string }).message)
        : null) ||
      (text && !text.startsWith('{') ? text.slice(0, 200) : null) ||
      `Request failed (${res.status})`
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
 * handler. Returns:
 *   - `ClientUser` if there's a valid session.
 *   - `null` if there's definitively NO session (200 with null user, or 401).
 *   - `undefined` if the check FAILED (network error, server compiling during
 *     HMR, etc.) — callers should NOT clear the user in this case, to avoid
 *     logging the user out during transient dev-server blips.
 */
export async function fetchMe(): Promise<ClientUser | null | undefined> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    if (res.status === 401) return null // definitively no session
    if (!res.ok) return undefined // server error — unknown state
    const data = (await res.json()) as { user: ClientUser | null }
    return data.user
  } catch {
    // Network error (server restarting, HMR, offline) — don't log the user out.
    return undefined
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
