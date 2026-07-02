import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, error, requireUser, getAccess, canWrite } from '@/lib/access'
import { nanoid } from 'nanoid'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Create a git-style commit: snapshot one or all files into Version records.
 * Body: { message: string, filePath?: string }
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const header = req.headers.get('x-codesync-user')
  const { user, error: err } = await requireUser(header)
  if (err) return err
  const { project, permission } = await getAccess(id, user)
  if (!project) return error(404, 'Project not found')
  if (!canWrite(permission)) return error(403, 'Read-only access')

  const body = await req.json().catch(() => ({}))
  const { message = 'Save progress', filePath } = body as { message?: string; filePath?: string }
  const commitHash = nanoid(8)
  const authorName = user!.name

  const files = filePath
    ? await db.file.findMany({ where: { projectId: id, path: filePath } })
    : await db.file.findMany({ where: { projectId: id } })

  if (files.length === 0) return error(404, 'No files to commit')

  const created = []
  for (const file of files) {
    const prev = await db.version.findFirst({
      where: { fileId: file.id },
      orderBy: { createdAt: 'desc' },
    })
    // skip if content unchanged
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
