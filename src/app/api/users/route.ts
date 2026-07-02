import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { jsonWithCookie, sessionCookieHeader, error } from '@/lib/access'
import { getTemplate } from '@/lib/templates'
import { nanoid } from 'nanoid'
import { signInSchema } from '@/lib/validations'

export const dynamic = 'force-dynamic'

/** Sign in / register: create-or-get a user by email, then set a signed
 *  httpOnly session cookie. The client never sees or controls the cookie. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const parsed = signInSchema.safeParse(body)
  if (!parsed.success) {
    return error(400, parsed.error.issues.map((i) => i.message).join('; '))
  }
  const { name, email } = parsed.data

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    return jsonWithCookie(
      { id: existing.id, name: existing.name, email: existing.email, color: existing.avatarColor },
      sessionCookieHeader(existing.id, req)
    )
  }

  const created = await db.user.create({
    data: { name, email, avatarColor: pickColor() },
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

  return jsonWithCookie(
    { id: created.id, name: created.name, email: created.email, color: created.avatarColor },
    sessionCookieHeader(created.id, req),
    201
  )
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4']
function pickColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)]
}
