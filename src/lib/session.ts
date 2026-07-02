import { db } from '@/lib/db'
import { createHmac, timingSafeEqual } from 'crypto'
import type { ClientUser } from '@/lib/types'

export type { ClientUser } from '@/lib/types'
export type { Permission } from '@/lib/types'

/**
 * Server-side session management using a signed httpOnly cookie.
 *
 * The cookie value is `${userId}.${hmac(userId)}` so it cannot be forged or
 * tampered with by the client — only the server can mint a valid session.
 * The client never sees the cookie contents (httpOnly) and cannot read or
 * modify it via JavaScript.
 */

export const SESSION_COOKIE = 'codesync_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days
// In production this MUST be set via env. The fallback is for local dev only.
const SECRET = process.env.CODESYNC_SESSION_SECRET || 'codesync-dev-session-secret-rotate-me'

const AVATAR_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4']

export function randomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
}

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('hex')
}

function makeCookieValue(userId: string): string {
  return `${userId}.${sign(userId)}`
}

function verifyCookieValue(value: string): string | null {
  const dot = value.lastIndexOf('.')
  if (dot < 1) return null
  const userId = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  const expected = sign(userId)
  try {
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return null
    return timingSafeEqual(a, b) ? userId : null
  } catch {
    return null
  }
}

/** Build the Set-Cookie header value for an authenticated session. */
export function sessionCookieHeader(userId: string): string {
  const val = makeCookieValue(userId)
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${SESSION_COOKIE}=${val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`
}

/** Build the Set-Cookie header value that clears the session cookie. */
export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

function readCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get('cookie')
  if (!cookie) return null
  for (const part of cookie.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(`${name}=`)) {
      return trimmed.slice(name.length + 1)
    }
  }
  return null
}

/**
 * Resolve the acting user from the signed session cookie on the request.
 * Returns null if there is no cookie, the cookie is invalid/tampered, or the
 * user no longer exists. The client cannot forge this — only /api/users POST
 * (sign-in) mints a valid cookie.
 */
export async function resolveUser(req: Request): Promise<ClientUser | null> {
  const raw = readCookie(req, SESSION_COOKIE)
  if (!raw) return null
  const userId = verifyCookieValue(raw)
  if (!userId) return null
  const dbUser = await db.user.findUnique({ where: { id: userId } })
  if (!dbUser) return null
  return { id: dbUser.id, name: dbUser.name, email: dbUser.email, color: dbUser.avatarColor }
}

/** Require an authenticated user, returning a 401 Response if missing/invalid. */
export async function requireUser(req: Request): Promise<{ user: ClientUser } | { error: Response }> {
  const user = await resolveUser(req)
  if (!user) {
    return {
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    }
  }
  return { user }
}
