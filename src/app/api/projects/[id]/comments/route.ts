import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, error, requireUser, getAccess, canRead, canWrite } from '@/lib/access'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const header = req.headers.get('x-codesync-user')
  const user = header ? await (await import('@/lib/session')).resolveUser(header) : null
  const { project, permission } = await getAccess(id, user)
  if (!project) return error(404, 'Project not found')
  if (!canRead(permission)) return error(403, 'No access')

  const comments = await db.comment.findMany({
    where: { projectId: id },
    orderBy: { createdAt: 'asc' },
  })
  return json(comments)
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const header = req.headers.get('x-codesync-user')
  const { user, error: err } = await requireUser(header)
  if (err) return err
  const { project, permission } = await getAccess(id, user)
  if (!project) return error(404, 'Project not found')
  if (!canWrite(permission)) return error(403, 'Read-only access')

  const body = await req.json().catch(() => ({}))
  const { filePath, lineNumber, content } = body as {
    filePath?: string
    lineNumber?: number
    content?: string
  }
  if (!filePath || lineNumber === undefined || !content) {
    return error(400, 'filePath, lineNumber and content are required')
  }

  const comment = await db.comment.create({
    data: {
      projectId: id,
      filePath,
      lineNumber,
      content,
      authorName: user!.name,
    },
  })
  return json(comment, 201)
}
