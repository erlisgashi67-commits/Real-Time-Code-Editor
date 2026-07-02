import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, error, requireUser } from '@/lib/access'
import type { Permission } from '@/lib/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ token: string }> }

/** Public: resolve a share link to project metadata (no auth required). */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params
  const link = await db.shareLink.findUnique({ where: { token } })
  if (!link) return error(404, 'Share link not found')
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return error(410, 'This share link has expired')
  }

  const project = await db.project.findUnique({
    where: { id: link.projectId },
    select: { id: true, name: true, description: true, template: true, language: true },
  })
  if (!project) return error(404, 'Project not found')

  return json({
    valid: true,
    projectId: project.id,
    name: project.name,
    description: project.description,
    template: project.template,
    language: project.language,
    permission: link.permission,
  })
}

/** Claim a share link: register the current (cookie-authed) user as a collaborator.
 *  Access is granted by the user's stable account ID — NOT by display name —
 *  so two accounts with the same name can't inherit each other's access.
 *
 *  Resolution order:
 *    1. Existing collaborator linked to this userId → update permission.
 *    2. Pending name-only invite (userId=null) whose userName matches this
 *       user's name → LINK it (set userId + permission), converting the
 *       pending invite into a real collaborator record. This cleans up stale
 *       pending invites instead of leaving duplicates.
 *    3. No existing record → create a new collaborator. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params
  const auth = await requireUser(req)
  if (!auth.ok) return auth.error

  const link = await db.shareLink.findUnique({ where: { token } })
  if (!link) return error(404, 'Share link not found')
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return error(410, 'This share link has expired')
  }

  const perm = link.permission as Permission
  const projectId = link.projectId
  const { id: userId, name: userName } = auth.user

  // 1. Already linked to this account?
  const linked = await db.collaborator.findFirst({
    where: { projectId, userId },
  })
  if (linked) {
    await db.collaborator.update({
      where: { id: linked.id },
      data: { permission: perm },
    })
    return json({ projectId, permission: perm })
  }

  // 2. Pending name-only invite matching this user's name → link it.
  const pending = await db.collaborator.findFirst({
    where: { projectId, userId: null, userName },
  })
  if (pending) {
    await db.collaborator.update({
      where: { id: pending.id },
      data: { userId, permission: perm },
    })
    return json({ projectId, permission: perm })
  }

  // 3. No existing record → create one linked to this account.
  await db.collaborator.create({
    data: { projectId, userName, userId, permission: perm },
  })

  return json({ projectId, permission: perm })
}
