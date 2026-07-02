import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, error, requireUser, resolveUser, getAccess, isAdmin } from '@/lib/access'
import { createCollaboratorSchema, validate } from '@/lib/validations'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const user = await resolveUser(req)
  const { project, permission } = await getAccess(id, user)
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
  const { user, error: err } = await requireUser(req)
  if (err) return err
  const { project, permission } = await getAccess(id, user)
  if (!project) return error(404, 'Project not found')
  if (!isAdmin(permission)) return error(403, 'Only the owner can manage collaborators')

  const body = await req.json().catch(() => ({}))
  const parsed = validate(createCollaboratorSchema, body)
  if ('error' in parsed) return parsed.error
  const { userName, email, permission: perm } = parsed.data

  let linkedUser: { id: string } | null = null
  if (email) {
    linkedUser = await db.user.findUnique({ where: { email }, select: { id: true } })
  }

  const collab = await db.collaborator.upsert({
    where: { projectId_userName: { projectId: id, userName } },
    update: { permission: perm, userId: linkedUser?.id || null },
    create: {
      projectId: id,
      userName,
      userId: linkedUser?.id || null,
      permission: perm,
    },
  })
  return json(collab, 201)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const { user, error: err } = await requireUser(req)
  if (err) return err
  const { project, permission } = await getAccess(id, user)
  if (!project) return error(404, 'Project not found')
  if (!isAdmin(permission)) return error(403, 'Only the owner can manage collaborators')

  const url = new URL(req.url)
  const collabId = url.searchParams.get('id')
  const userName = url.searchParams.get('userName')
  if (collabId) {
    await db.collaborator.deleteMany({ where: { id: collabId, projectId: id } })
  } else if (userName) {
    await db.collaborator.deleteMany({ where: { projectId: id, userName } })
  }
  return json({ ok: true })
}
