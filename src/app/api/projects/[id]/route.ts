import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, error, requireUser, resolveUser, getAccess, canWrite, isAdmin } from '@/lib/access'
import { updateProjectSchema, validate } from '@/lib/validations'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const currentUser = await resolveUser(req)
  const { project, permission } = await getAccess(id, currentUser)
  if (!project) return error(404, 'Project not found')
  if (!permission) return error(403, 'You do not have access to this project')

  const [owner, collaborators, _count] = await Promise.all([
    db.user.findUnique({ where: { id: project.ownerId } }),
    db.collaborator.findMany({ where: { projectId: id } }),
    db.file.count({ where: { projectId: id } }),
  ])

  return json({
    id: project.id,
    name: project.name,
    description: project.description,
    template: project.template,
    language: project.language,
    isPublic: project.isPublic,
    ownerName: owner?.name || 'unknown',
    ownerId: project.ownerId,
    permission,
    fileCount: _count,
    collaborators: collaborators.map((c) => ({ id: c.id, userName: c.userName, permission: c.permission })),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const auth = await requireUser(req)
  if (!auth.ok) return auth.error
  const { project, permission } = await getAccess(id, auth.user)
  if (!project) return error(404, 'Project not found')
  if (!canWrite(permission)) return error(403, 'Read-only access')

  const body: unknown = await req.json().catch(() => ({}))
  const parsed = validate(updateProjectSchema, body)
  if ('error' in parsed) return parsed.error
  const { name, description, isPublic } = parsed.data

  // Only the owner can change visibility; collaborators with WRITE can rename/edit description
  if (isPublic !== undefined && !isAdmin(permission)) {
    return error(403, 'Only the owner can change project visibility')
  }

  const updated = await db.project.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(isPublic !== undefined ? { isPublic } : {}),
    },
  })
  return json({ id: updated.id, name: updated.name })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const auth = await requireUser(req)
  if (!auth.ok) return auth.error
  const { project, permission } = await getAccess(id, auth.user)
  if (!project) return error(404, 'Project not found')
  if (!isAdmin(permission)) return error(403, 'Only the owner can delete this project')

  await db.project.delete({ where: { id } })
  return json({ ok: true })
}
