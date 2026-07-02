import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, error, requireUser, getAccess, isAdmin } from '@/lib/access'
import { nanoid } from 'nanoid'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const header = req.headers.get('x-codesync-user')
  const { user, error: err } = await requireUser(header)
  if (err) return err
  const { project, permission } = await getAccess(id, user)
  if (!project) return error(404, 'Project not found')
  if (!isAdmin(permission)) return error(403, 'Only the owner can manage share links')

  const links = await db.shareLink.findMany({
    where: { projectId: id },
    orderBy: { createdAt: 'desc' },
  })
  return json(links)
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const header = req.headers.get('x-codesync-user')
  const { user, error: err } = await requireUser(header)
  if (err) return err
  const { project, permission } = await getAccess(id, user)
  if (!project) return error(404, 'Project not found')
  if (!isAdmin(permission)) return error(403, 'Only the owner can create share links')

  const body = await req.json().catch(() => ({}))
  const { permission: linkPermission = 'WRITE', expiresAt } = body as {
    permission?: string
    expiresAt?: string
  }

  if (!['READ', 'WRITE'].includes(linkPermission)) {
    return error(400, 'permission must be READ or WRITE')
  }

  const link = await db.shareLink.create({
    data: {
      projectId: id,
      token: nanoid(16),
      permission: linkPermission,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  })
  return json(link, 201)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const header = req.headers.get('x-codesync-user')
  const { user, error: err } = await requireUser(header)
  if (err) return err
  const { project, permission } = await getAccess(id, user)
  if (!project) return error(404, 'Project not found')
  if (!isAdmin(permission)) return error(403, 'Only the owner can manage share links')

  const url = new URL(req.url)
  const tokenId = url.searchParams.get('id')
  if (tokenId) {
    await db.shareLink.deleteMany({ where: { id: tokenId, projectId: id } })
  }
  return json({ ok: true })
}
