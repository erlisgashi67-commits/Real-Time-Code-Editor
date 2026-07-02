import { json, clearSessionCookieHeader, jsonWithCookie } from '@/lib/access'
import { resolveUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Return the currently authenticated user from the signed session cookie. */
export async function GET(req: Request) {
  const user = await resolveUser(req)
  if (!user) return json({ user: null })
  return json({ user })
}

/** Sign out: clear the session cookie. */
export async function DELETE() {
  return jsonWithCookie({ ok: true }, clearSessionCookieHeader())
}
