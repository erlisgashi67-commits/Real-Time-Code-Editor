import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, error, requireUser } from '@/lib/access'
import { getTemplate } from '@/lib/templates'
import { nanoid } from 'nanoid'

export const dynamic = 'force-dynamic'

/** List projects owned by or collaborated on by the current user. */
export async function GET(req: NextRequest) {
  const header = req.headers.get('x-codesync-user')
  const { user, error: err } = await requireUser(header)
  if (err) return err

  const [owned, collabs] = await Promise.all([
    db.project.findMany({
      where: { ownerId: user!.id },
      include: { owner: true, _count: { select: { files: true, collaborators: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
    db.collaborator.findMany({
      where: { userId: user!.id },
      include: { project: { include: { owner: true, _count: { select: { files: true, collaborators: true } } } } },
    }),
  ])

  const items = [
    ...owned.map((p) => ({ ...p, role: 'owner' as const })),
    ...collabs.map((c) => ({ ...c.project, role: c.permission as const })),
  ]

  return json(
    items.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      template: p.template,
      language: p.language,
      ownerName: p.owner?.name || 'unknown',
      isOwner: p.role === 'owner',
      role: p.role,
      fileCount: p._count?.files ?? 0,
      collaboratorCount: p._count?.collaborators ?? 0,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }))
  )
}

/** Create a new project from a template. */
export async function POST(req: NextRequest) {
  const header = req.headers.get('x-codesync-user')
  const { user, error: err } = await requireUser(header)
  if (err) return err

  const body = await req.json().catch(() => ({}))
  const { name, description, templateId } = body as {
    name?: string
    description?: string
    templateId?: string
  }
  if (!name) return error(400, 'name is required')

  const template = getTemplate(templateId || 'blank')
  const project = await db.project.create({
    data: {
      name,
      description: description || template.description,
      template: template.id,
      language: template.language,
      ownerId: user!.id,
      files: {
        create: template.files.map((f) => ({ path: f.path, content: f.content })),
      },
    },
    include: { files: true },
  })

  // record initial commit
  for (const file of project.files) {
    await db.version.create({
      data: {
        fileId: file.id,
        projectId: project.id,
        content: file.content,
        message: 'Initial commit',
        authorName: user!.name,
        hash: nanoid(8),
      },
    })
  }

  return json({ id: project.id, name: project.name }, 201)
}
