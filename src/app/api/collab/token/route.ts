import { NextRequest } from 'next/server'
import { createHmac } from 'crypto'
import { json, error, requireUser } from '@/lib/access'

export const dynamic = 'force-dynamic'

/**
 * Mint a short-lived signed token that the client passes to the Socket.IO
 * collab service as `auth.token` in the handshake. The collab service verifies
 * this token (using the shared CODESYNC_SESSION_SECRET) before accepting the
 * connection — so the socket layer never trusts client-supplied identity.
 *
 * Token format: `${userId}.${exp}.${hmac(userId:exp)}`
 *   - exp: epoch seconds, 5 minutes from now
 *   - hmac: HMAC-SHA256 of `${userId}:${exp}` keyed by the session secret
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.error

  const { id: userId } = auth.user
  const exp = Math.floor(Date.now() / 1000) + 300 // 5 minutes
  const secret = process.env.CODESYNC_SESSION_SECRET
  if (!secret || secret.length < 32) {
    return error(500, 'Server session secret not configured')
  }
  const sig = createHmac('sha256', secret).update(`${userId}:${exp}`).digest('hex')
  const token = `${userId}.${exp}.${sig}`
  return json({ token })
}
