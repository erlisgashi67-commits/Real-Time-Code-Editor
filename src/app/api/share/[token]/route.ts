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
 *  so two accounts with the same name can't inherit each other's access. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params
  const { user, error: err } = await requireUser(req)
  if (err) return err

  const link = await db.shareLink.findUnique({ where: { token } })
  if (!link) return error(404, 'Share link not found')
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return error(410, 'This share link has expired')
  }

  const perm = link.permission as Permission
  // Upsert by [projectId, userId] — the user's stable account ID. If a
  // pending email-invite (userId=null) exists for this user, link it;
  // otherwise create a new collaborator record.
  const existing = await db.collaborator.findFirst({
    where: { projectId: link.projectId, userId: user!.id },
  })
  if (existing) {
    await db.collaborator.update({
      where: { id: existing.id },
      data: { permission: perm },
    })
  } else {
    await db.collaborator.create({
      data: {
        projectId: link.projectId,
        userName: user!.name,
        userId: user!.id,
        permission: perm,
      },
    })
  }

  return json({ projectId: link.projectId, permission: perm })
}
