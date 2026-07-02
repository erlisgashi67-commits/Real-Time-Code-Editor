import { db } from '@/lib/db'

export interface ClientUser {
  id: string
  name: string
  email: string
  color: string
}

const AVATAR_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4']

export function randomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
}

/**
 * Resolve the acting user from the `x-codesync-user` header (JSON blob).
 * Creates the user record if it doesn't yet exist (idempotent by email).
 */
export async function resolveUser(header: string | null): Promise<ClientUser | null> {
  if (!header) return null
  try {
    const parsed = JSON.parse(header) as Partial<ClientUser>
    if (!parsed.email || !parsed.name) return null

    let user = await db.user.findUnique({ where: { email: parsed.email } })
    if (!user) {
      user = await db.user.create({
        data: {
          email: parsed.email,
          name: parsed.name,
          avatarColor: parsed.color || randomColor(),
        },
      })
    }
    return { id: user.id, name: user.name, email: user.email, color: user.avatarColor }
  } catch {
    return null
  }
}

/** Require an authenticated user, returning a 401-shaped error object if missing. */
export async function requireUser(header: string | null): Promise<{ user: ClientUser } | { error: Response }> {
  const user = await resolveUser(header)
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

export function userHeader(user: ClientUser): string {
  return JSON.stringify(user)
}
