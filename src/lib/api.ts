'use client'

import type { ClientUser } from '@/lib/types'

const USER_HEADER = 'x-codesync-user'
const STORAGE_KEY = 'codesync-user'

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

function userHeader(): string | null {
  const u = getStoredUser()
  return u ? JSON.stringify(u) : null
}

export async function api<T = unknown>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const headers = new Headers(opts.headers)
  if (!headers.has('content-type') && opts.body) {
    headers.set('content-type', 'application/json')
  }
  const uh = userHeader()
  if (uh) headers.set(USER_HEADER, uh)

  const res = await fetch(path, { ...opts, headers })
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
