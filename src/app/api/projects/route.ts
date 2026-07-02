import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, requireUser } from '@/lib/access'
import { getTemplate } from '@/lib/templates'
import { nanoid } from 'nanoid'
import { createProjectSchema, validate } from '@/lib/validations'

export const dynamic = 'force-dynamic'

/** List projects owned by or collaborated on by the current user. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.error

  const [owned, collabs] = await Promise.all([
    db.project.findMany({
      where: { ownerId: auth.user.id },
      include: { owner: true, _count: { select: { files: true, collaborators: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
    db.collaborator.findMany({
      where: { userId: auth.user.id },
      include: { project: { include: { owner: true, _count: { select: { files: true, collaborators: true } } } } },
    }),
  ])

  // Normalize roles into a typed union so the map below type-checks cleanly.
  type ProjectRole = 'owner' | 'READ' | 'WRITE' | 'ADMIN'
  const items: Array<{ id: string; name: string; description: string; template: string; language: string; ownerId: string; createdAt: Date; updatedAt: Date; owner: { name: string | null } | null; _count?: { files: number; collaborators: number }; role: ProjectRole }> = [
    ...owned.map((p) => ({ ...p, role: 'owner' as ProjectRole })),
    ...collabs.map((c) => ({ ...c.project, role: c.permission as ProjectRole })),
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
  const auth = await requireUser(req)
  if (!auth.ok) return auth.error

  const body = await req.json().catch(() => ({}))
  const parsed = validate(createProjectSchema, body)
  if ('error' in parsed) return parsed.error
  const { name, description, templateId } = parsed.data

  const template = getTemplate(templateId || 'blank')
  const project = await db.project.create({
    data: {
      name,
      description: description || template.description,
      template: template.id,
      language: template.language,
      ownerId: auth.user.id,
      files: {
        create: template.files.map((f) => ({ path: f.path, content: f.content })),
      },
    },
    include: { files: true },
  })

  for (const file of project.files) {
    await db.version.create({
      data: {
        fileId: file.id,
        projectId: project.id,
        content: file.content,
        message: 'Initial commit',
        authorName: auth.user.name,
        hash: nanoid(8),
      },
    })
  }

  return json({ id: project.id, name: project.name }, 201)
}
