import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, error, requireUser, resolveUser, getAccess, canWrite, canRead } from '@/lib/access'
import { createFileSchema, validate } from '@/lib/validations'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** List files in a project (path + metadata, no content to keep payloads small). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const user = await resolveUser(req)
  const { project, permission } = await getAccess(id, user)
  if (!project) return error(404, 'Project not found')
  if (!canRead(permission)) return error(403, 'No access')

  const files = await db.file.findMany({
    where: { projectId: id },
    select: { id: true, path: true, updatedAt: true },
    orderBy: { path: 'asc' },
  })
  return json(files)
}

/** Create a new file. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const { user, error: err } = await requireUser(req)
  if (err) return err
  const { project, permission } = await getAccess(id, user)
  if (!project) return error(404, 'Project not found')
  if (!canWrite(permission)) return error(403, 'Read-only access')

  const body = await req.json().catch(() => ({}))
  const parsed = validate(createFileSchema, body)
  if ('error' in parsed) return parsed.error
  const { path, content } = parsed.data

  const existing = await db.file.findUnique({ where: { projectId_path: { projectId: id, path } } })
  if (existing) return error(409, 'A file with that path already exists')

  const file = await db.file.create({
    data: { projectId: id, path, content },
  })
  await db.project.update({ where: { id }, data: { updatedAt: new Date() } })
  return json({ id: file.id, path: file.path }, 201)
}
