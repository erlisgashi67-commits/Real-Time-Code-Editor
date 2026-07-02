import { clearSessionCookieHeader, jsonWithCookie } from '@/lib/access'

export const dynamic = 'force-dynamic'

/** Sign out: clear the session cookie. */
export async function POST(req: Request) {
  return jsonWithCookie({ ok: true }, clearSessionCookieHeader(req))
}
