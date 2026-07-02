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

/** Claim a share link: register the current user as a collaborator. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params
  const header = req.headers.get('x-codesync-user')
  const { user, error: err } = await requireUser(header)
  if (err) return err

  const link = await db.shareLink.findUnique({ where: { token } })
  if (!link) return error(404, 'Share link not found')
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return error(410, 'This share link has expired')
  }

  const perm = link.permission as Permission
  await db.collaborator.upsert({
    where: { projectId_userName: { projectId: link.projectId, userName: user!.name } },
    update: { permission: perm, userId: user!.id },
    create: { projectId: link.projectId, userName: user!.name, userId: user!.id, permission: perm },
  })

  return json({ projectId: link.projectId, permission: perm })
}
