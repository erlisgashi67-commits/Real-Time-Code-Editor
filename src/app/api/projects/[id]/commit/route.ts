import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, error, requireUser, getAccess, canWrite } from '@/lib/access'
import { nanoid } from 'nanoid'
import { commitSchema, validate } from '@/lib/validations'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Create a git-style commit: snapshot one or all files into Version records.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const auth = await requireUser(req)
  if (!auth.ok) return auth.error
  const { project, permission } = await getAccess(id, auth.user)
  if (!project) return error(404, 'Project not found')
  if (!canWrite(permission)) return error(403, 'Read-only access')

  const body: unknown = await req.json().catch(() => ({}))
  const parsed = validate(commitSchema, body)
  if ('error' in parsed) return parsed.error
  const { message, filePath } = parsed.data
  const commitHash = nanoid(8)
  const authorName = auth.user.name

  const files = filePath
    ? await db.file.findMany({ where: { projectId: id, path: filePath } })
    : await db.file.findMany({ where: { projectId: id } })

  if (files.length === 0) return error(404, 'No files to commit')

  const created: Array<{ id: string; filePath: string; hash: string }> = []
  for (const file of files) {
    const prev = await db.version.findFirst({
      where: { fileId: file.id },
      orderBy: { createdAt: 'desc' },
    })
    if (prev && prev.content === file.content) continue
    const version = await db.version.create({
      data: {
        fileId: file.id,
        projectId: id,
        content: file.content,
        message,
        authorName,
        hash: commitHash,
        parentHash: prev?.hash || null,
      },
    })
    created.push({ id: version.id, filePath: file.path, hash: version.hash })
  }

  return json({
    hash: commitHash,
    message,
    authorName,
    snapshots: created.length,
    files: created,
  })
}
