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

  const messages = await db.chatMessage.findMany({
    where: { projectId: id },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })
  return json(messages)
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
  const { content } = body as { content?: string }
  if (!content || !content.trim()) return error(400, 'content is required')

  const message = await db.chatMessage.create({
    data: {
      projectId: id,
      authorName: user!.name,
      content: content.trim(),
    },
  })
  return json(message, 201)
}
