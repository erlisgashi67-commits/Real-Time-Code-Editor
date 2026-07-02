import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, error, requireUser, resolveUser, getAccess, canWrite, canRead } from '@/lib/access'
import { updateFileSchema, validate } from '@/lib/validations'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; fid: string }> }

/** Get a single file's content. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id, fid } = await ctx.params
  const currentUser = await resolveUser(req)
  const { project, permission } = await getAccess(id, currentUser)
  if (!project) return error(404, 'Project not found')
  if (!canRead(permission)) return error(403, 'No access')

  const file = await db.file.findUnique({ where: { id: fid } })
  if (!file || file.projectId !== id) return error(404, 'File not found')
  return json({ id: file.id, path: file.path, content: file.content, updatedAt: file.updatedAt })
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id, fid } = await ctx.params
  const auth = await requireUser(req)
  if (!auth.ok) return auth.error
  const { project, permission } = await getAccess(id, auth.user)
  if (!project) return error(404, 'Project not found')
  if (!canWrite(permission)) return error(403, 'Read-only access')

  const body = await req.json().catch(() => ({}))
  const parsed = validate(updateFileSchema, body)
  if ('error' in parsed) return parsed.error
  const { content, path } = parsed.data

  const file = await db.file.findUnique({ where: { id: fid } })
  if (!file || file.projectId !== id) return error(404, 'File not found')

  // if renaming, ensure the target path doesn't collide
  if (path && path !== file.path) {
    const clash = await db.file.findUnique({ where: { projectId_path: { projectId: id, path } } })
    if (clash) return error(409, 'A file with that path already exists')
  }

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
  const auth = await requireUser(req)
  if (!auth.ok) return auth.error
  const { project, permission } = await getAccess(id, auth.user)
  if (!project) return error(404, 'Project not found')
  if (!canWrite(permission)) return error(403, 'Read-only access')

  const file = await db.file.findUnique({ where: { id: fid } })
  if (!file || file.projectId !== id) return error(404, 'File not found')

  await db.file.delete({ where: { id: fid } })
  await db.project.update({ where: { id }, data: { updatedAt: new Date() } })
  return json({ ok: true })
}
