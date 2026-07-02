import { clearSessionCookieHeader, jsonWithCookie } from '@/lib/access'

export const dynamic = 'force-dynamic'

/** Sign out: clear the session cookie. */
export async function POST() {
  return jsonWithCookie({ ok: true }, clearSessionCookieHeader())
}
