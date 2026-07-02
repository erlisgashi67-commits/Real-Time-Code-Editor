import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, error, getAccess, canRead, requireUser } from '@/lib/access'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** List version history for a file (or all files). Query: ?filePath= or ?fileId= */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const header = req.headers.get('x-codesync-user')
  const user = header ? await (await import('@/lib/session')).resolveUser(header) : null
  const { project, permission } = await getAccess(id, user)
  if (!project) return error(404, 'Project not found')
  if (!canRead(permission)) return error(403, 'No access')

  const url = new URL(req.url)
  const filePath = url.searchParams.get('filePath')
  const fileId = url.searchParams.get('fileId')

  let where: { projectId: string; fileId?: string } = { projectId: id }
  if (fileId) where.fileId = fileId
  else if (filePath) {
    const file = await db.file.findUnique({ where: { projectId_path: { projectId: id, path: filePath } } })
    if (!file) return json([])
    where.fileId = file.id
  }

  const versions = await db.version.findMany({
    where,
    include: { file: { select: { path: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return json(
    versions.map((v) => ({
      id: v.id,
      fileId: v.fileId,
      filePath: v.file.path,
      message: v.message,
      authorName: v.authorName,
      hash: v.hash,
      parentHash: v.parentHash,
      createdAt: v.createdAt,
    }))
  )
}

/** Restore a file to a given version's content. Body: { versionId } */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const header = req.headers.get('x-codesync-user')
  const { user, error: err } = await requireUser(header)
  if (err) return err
  const { project, permission } = await getAccess(id, user)
  if (!project) return error(404, 'Project not found')
  if (!canWrite(permission)) return error(403, 'Read-only access')

  const body = await req.json().catch(() => ({}))
  const { versionId } = body as { versionId?: string }
  if (!versionId) return error(400, 'versionId is required')

  const version = await db.version.findUnique({ where: { id: versionId } })
  if (!version || version.projectId !== id) return error(404, 'Version not found')

  await db.file.update({ where: { id: version.fileId }, data: { content: version.content } })

  // record the restore as a new version
  await db.version.create({
    data: {
      fileId: version.fileId,
      projectId: id,
      content: version.content,
      message: `Revert to ${version.hash}`,
      authorName: user!.name,
      hash: version.hash + '-r',
      parentHash: version.hash,
    },
  })

  return json({ ok: true, fileId: version.fileId, restoredHash: version.hash })
}
