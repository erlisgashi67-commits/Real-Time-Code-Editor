'use client'

import type { ClientUser } from '@/lib/types'

const STORAGE_KEY = 'codesync-user'

/**
 * The user object is cached in localStorage purely for instant UI hydration
 * (so the dashboard doesn't flash the auth gate on reload). The source of
 * truth is the signed httpOnly session cookie set by /api/users POST — the
 * client cannot read or forge it. Every API request is authenticated via
 * `credentials: 'include'`, never via a client-supplied header.
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
