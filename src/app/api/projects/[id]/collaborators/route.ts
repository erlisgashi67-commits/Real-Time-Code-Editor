import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, error, requireUser, getAccess, isAdmin } from '@/lib/access'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const header = req.headers.get('x-codesync-user')
  const user = header ? await (await import('@/lib/session')).resolveUser(header) : null
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
  const header = req.headers.get('x-codesync-user')
  const { user, error: err } = await requireUser(header)
  if (err) return err
  const { project, permission } = await getAccess(id, user)
  if (!project) return error(404, 'Project not found')
  if (!isAdmin(permission)) return error(403, 'Only the owner can manage collaborators')

  const body = await req.json().catch(() => ({}))
  const { userName, email, permission: perm = 'WRITE' } = body as {
    userName?: string
    email?: string
    permission?: string
  }
  if (!userName) return error(400, 'userName is required')
  if (!['READ', 'WRITE', 'ADMIN'].includes(perm)) return error(400, 'invalid permission')

  // try to link to an existing user by email
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
  const header = req.headers.get('x-codesync-user')
  const { user, error: err } = await requireUser(header)
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
