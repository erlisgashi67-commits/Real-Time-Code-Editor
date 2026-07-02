import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, error, requireUser, getAccess, canWrite, canRead } from '@/lib/access'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; fid: string }> }

/** Get a single file's content, or update it, or delete it. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id, fid } = await ctx.params
  const header = req.headers.get('x-codesync-user')
  const user = header ? await (await import('@/lib/session')).resolveUser(header) : null
  const { project, permission } = await getAccess(id, user)
  if (!project) return error(404, 'Project not found')
  if (!canRead(permission)) return error(403, 'No access')

  const file = await db.file.findUnique({ where: { id: fid } })
  if (!file || file.projectId !== id) return error(404, 'File not found')
  return json({ id: file.id, path: file.path, content: file.content, updatedAt: file.updatedAt })
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id, fid } = await ctx.params
  const header = req.headers.get('x-codesync-user')
  const { user, error: err } = await requireUser(header)
  if (err) return err
  const { project, permission } = await getAccess(id, user)
  if (!project) return error(404, 'Project not found')
  if (!canWrite(permission)) return error(403, 'Read-only access')

  const body = await req.json().catch(() => ({}))
  const { content, path } = body as { content?: string; path?: string }

  const file = await db.file.findUnique({ where: { id: fid } })
  if (!file || file.projectId !== id) return error(404, 'File not found')

  const updated = await db.file.update({
    where: { id: fid },
    data: {
      ...(content !== undefined ? { content } : {}),
      ...(path !== undefined ? { path } : {}),
    },
  })
  await db.project.update({ where: { id }, data: { updatedAt: new Date() } })
  return json({ id: updated.id, path: updated.path, updatedAt: updated.updatedAt })
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id, fid } = await ctx.params
  const header = req.headers.get('x-codesync-user')
  const { user, error: err } = await requireUser(header)
  if (err) return err
  const { project, permission } = await getAccess(id, user)
  if (!project) return error(404, 'Project not found')
  if (!canWrite(permission)) return error(403, 'Read-only access')

  const file = await db.file.findUnique({ where: { id: fid } })
  if (!file || file.projectId !== id) return error(404, 'File not found')

  await db.file.delete({ where: { id: fid } })
  await db.project.update({ where: { id }, data: { updatedAt: new Date() } })
  return json({ ok: true })
}
