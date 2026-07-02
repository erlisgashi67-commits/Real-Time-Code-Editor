import { db } from '@/lib/db'
import type { ClientUser, Permission } from '@/lib/types'

// Re-export identity helpers so routes can import everything from one module.
export { resolveUser, requireUser, randomColor, sessionCookieHeader, clearSessionCookieHeader } from '@/lib/session'
export type { ClientUser } from '@/lib/session'

export interface AccessResult {
  project: Awaited<ReturnType<typeof db.project.findUnique>>
  permission: Permission | null
}

/** Determine the permission level a user has on a project. */
export async function getAccess(
  projectId: string,
  user: ClientUser | null
): Promise<AccessResult> {
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) return { project: null, permission: null }

  if (project.ownerId === user?.id) return { project, permission: 'ADMIN' }

  if (user) {
    const collab = await db.collaborator.findFirst({
      where: {
        projectId,
        OR: [{ userId: user.id }, { userName: user.name }],
      },
    })
    if (collab) return { project, permission: collab.permission as Permission }
  }

  if (project.isPublic) return { project, permission: 'READ' }
  return { project, permission: null }
}

export const canRead = (p: Permission | null) => p !== null
export const canWrite = (p: Permission | null) => p === 'WRITE' || p === 'ADMIN'
export const isAdmin = (p: Permission | null) => p === 'ADMIN'

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export function error(status: number, message: string) {
  return json({ error: message }, status)
}

/** JSON response that also sets a Set-Cookie header (used by sign-in). */
export function jsonWithCookie(data: unknown, cookieHeader: string, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'set-cookie': cookieHeader,
    },
  })
}
