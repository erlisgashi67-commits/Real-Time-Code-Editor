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

/**
 * The HMAC secret used to sign session cookies. In production this MUST be
 * provided via the CODESYNC_SESSION_SECRET env var — if it's missing, we fail
 * closed (throw) rather than falling back to a predictable hardcoded secret.
 * In development, a fixed fallback is used so the dev server "just works".
 */
const SECRET = resolveSessionSecret()

function resolveSessionSecret(): string {
  const env = process.env.CODESYNC_SESSION_SECRET
  if (env && env.length >= 32) return env
  if (process.env.NODE_ENV === 'production') {
    // Fail closed: never run production with a predictable secret.
    throw new Error(
      'CODESYNC_SESSION_SECRET must be set to a random string of at least 32 characters in production. ' +
        'Refusing to start with an insecure session secret.'
    )
  }
  // Dev-only fallback — predictable but never used in production.
  return 'codesync-dev-session-secret-rotate-me'
}

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

/** Build the Set-Cookie header value for an authenticated session.
 *  Accepts an optional request so cookie attributes can adapt to the origin
 *  (e.g. SameSite=None for cross-origin preview domains). */
export function sessionCookieHeader(userId: string, req?: Request): string {
  const val = makeCookieValue(userId)
  const attrs = cookieAttributes(req)
  return `${SESSION_COOKIE}=${val}; Path=/; HttpOnly; ${attrs}; Max-Age=${COOKIE_MAX_AGE}`
}

/** Build the Set-Cookie header value that clears the session cookie. */
export function clearSessionCookieHeader(req?: Request): string {
  const attrs = cookieAttributes(req)
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; ${attrs}; Max-Age=0`
}

/**
 * Compute SameSite / Secure attributes for the cookie based on the request.
 * - Localhost (same-origin dev): SameSite=Lax (no Secure needed in dev).
 * - Cross-origin preview domain (HTTPS): SameSite=None; Secure — required for
 *   the browser to accept and send the cookie across origins.
 */
function cookieAttributes(req?: Request): string {
  const host = req?.headers.get('host') || ''
  const origin = req?.headers.get('origin') || ''
  const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1') ||
    origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')
  if (isLocalhost) {
    return process.env.NODE_ENV === 'production' ? 'SameSite=Lax; Secure' : 'SameSite=Lax'
  }
  // Cross-origin (preview domain, etc.) — must be SameSite=None; Secure
  return 'SameSite=None; Secure'
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
