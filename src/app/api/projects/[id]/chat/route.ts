import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, error, requireUser, resolveUser, getAccess, canRead, canWrite } from '@/lib/access'
import { createChatSchema, validate } from '@/lib/validations'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const user = await resolveUser(req)
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
  const { user, error: err } = await requireUser(req)
  if (err) return err
  const { project, permission } = await getAccess(id, user)
  if (!project) return error(404, 'Project not found')
  if (!canWrite(permission)) return error(403, 'Read-only access')

  const body = await req.json().catch(() => ({}))
  const parsed = validate(createChatSchema, body)
  if ('error' in parsed) return parsed.error
  const { content } = parsed.data

  const message = await db.chatMessage.create({
    data: {
      projectId: id,
      authorName: user!.name,
      content,
    },
  })
  return json(message, 201)
}
