import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, error, requireUser, getAccess, canWrite } from '@/lib/access'
import { updateCommentSchema, validate } from '@/lib/validations'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; cid: string }> }

/** Resolve / unresolve a comment, or delete it. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id, cid } = await ctx.params
  const { user, error: err } = await requireUser(req)
  if (err) return err
  const { project, permission } = await getAccess(id, user)
  if (!project) return error(404, 'Project not found')
  if (!canWrite(permission)) return error(403, 'Read-only access')

  const body = await req.json().catch(() => ({}))
  const parsed = validate(updateCommentSchema, body)
  if ('error' in parsed) return parsed.error
  const { resolved } = parsed.data

  const comment = await db.comment.findUnique({ where: { id: cid } })
  if (!comment || comment.projectId !== id) return error(404, 'Comment not found')

  const updated = await db.comment.update({
    where: { id: cid },
    data: { ...(resolved !== undefined ? { resolved } : {}) },
  })
  return json(updated)
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id, cid } = await ctx.params
  const { user, error: err } = await requireUser(req)
  if (err) return err
  const { project, permission } = await getAccess(id, user)
  if (!project) return error(404, 'Project not found')
  if (!canWrite(permission)) return error(403, 'Read-only access')

  const comment = await db.comment.findUnique({ where: { id: cid } })
  if (!comment || comment.projectId !== id) return error(404, 'Comment not found')

  await db.comment.delete({ where: { id: cid } })
  return json({ ok: true })
}
