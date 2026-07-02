import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, error } from '@/lib/access'
import { randomColor } from '@/lib/session'
import { getTemplate } from '@/lib/templates'
import { nanoid } from 'nanoid'

export const dynamic = 'force-dynamic'

/** Sign in / register: create-or-get a user by email. New users get a starter project. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { name, email } = body as { name?: string; email?: string }
  if (!name || !email) return error(400, 'name and email are required')

  const existing = await db.user.findUnique({
    where: { email },
    include: { _count: { select: { ownedProjects: true } } },
  })
  if (existing) {
    return json({
      id: existing.id,
      name: existing.name,
      email: existing.email,
      color: existing.avatarColor,
    })
  }

  const created = await db.user.create({
    data: { name, email, avatarColor: randomColor() },
  })

  // seed a starter project so the dashboard isn't empty
  const template = getTemplate('web-page')
  const starter = await db.project.create({
    data: {
      name: `${name}'s First Project`,
      description: 'A starter web page — edit the files and press Run to preview.',
      template: template.id,
      language: template.language,
      ownerId: created.id,
      files: { create: template.files.map((f) => ({ path: f.path, content: f.content })) },
    },
    include: { files: true },
  })
  for (const file of starter.files) {
    await db.version.create({
      data: {
        fileId: file.id,
        projectId: starter.id,
        content: file.content,
        message: 'Initial commit',
        authorName: created.name,
        hash: nanoid(8),
      },
    })
  }

  return json({
    id: created.id,
    name: created.name,
    email: created.email,
    color: created.avatarColor,
  })
}
