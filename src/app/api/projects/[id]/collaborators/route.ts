import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, error, requireUser, resolveUser, getAccess, isAdmin } from '@/lib/access'
import { createCollaboratorSchema, validate } from '@/lib/validations'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const currentUser = await resolveUser(req)
  const { project, permission } = await getAccess(id, currentUser)
  if (!project) return error(404, 'Project not found')
  if (!permission) return error(403, 'No access')

  const collaborators = await db.collaborator.findMany({
    where: { projectId: id },
    orderBy: { createdAt: 'asc' },
  })
  return json(collaborators)
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const auth = await requireUser(req)
  if (!auth.ok) return auth.error
  const { project, permission } = await getAccess(id, auth.user)
  if (!project) return error(404, 'Project not found')
  if (!isAdmin(permission)) return error(403, 'Only the owner can manage collaborators')

  const body = await req.json().catch(() => ({}))
  const parsed = validate(createCollaboratorSchema, body)
  if ('error' in parsed) return parsed.error
  const { userName, email, permission: perm } = parsed.data

  // Link to an existing auth.user account by email (the stable identifier).
  // The display `userName` is just for UI — access is always by userId.
  let linkedUser: { id: string } | null = null
  if (email) {
    linkedUser = await db.user.findUnique({ where: { email }, select: { id: true } })
  }

  if (linkedUser) {
    // Upsert by [projectId, userId] — the stable account ID.
    const existing = await db.collaborator.findFirst({
      where: { projectId: id, userId: linkedUser.id },
    })
    if (existing) {
      const updated = await db.collaborator.update({
        where: { id: existing.id },
        data: { permission: perm, userName },
      })
      return json(updated, 201)
    }
    const created = await db.collaborator.create({
      data: { projectId: id, userName, userId: linkedUser.id, permission: perm },
    })
    return json(created, 201)
  }

  // No linked auth.user (pending email invite) — create a name-only record.
  // userId stays null until the invitee signs up and claims a share link.
  const existingPending = await db.collaborator.findFirst({
    where: { projectId: id, userId: null, userName },
  })
  if (existingPending) {
    const updated = await db.collaborator.update({
      where: { id: existingPending.id },
      data: { permission: perm },
    })
    return json(updated, 201)
  }
  const created = await db.collaborator.create({
    data: { projectId: id, userName, userId: null, permission: perm },
  })
  return json(created, 201)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const auth = await requireUser(req)
  if (!auth.ok) return auth.error
  const { project, permission } = await getAccess(id, auth.user)
  if (!project) return error(404, 'Project not found')
  if (!isAdmin(permission)) return error(403, 'Only the owner can manage collaborators')

  const url = new URL(req.url)
  const collabId = url.searchParams.get('id')
  if (collabId) {
    await db.collaborator.deleteMany({ where: { id: collabId, projectId: id } })
  }
  return json({ ok: true })
}
