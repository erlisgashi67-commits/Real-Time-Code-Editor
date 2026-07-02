import { NextRequest } from 'next/server'
import { json, error, requireUser, getAccess, canRead } from '@/lib/access'
import { validate } from '@/lib/validations'
import { z } from 'zod'
import ZAI from 'z-ai-web-dev-sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * AI pair-programming assistant endpoint.
 *
 * Accepts the auth.user's chat message plus optional context about the file they're
 * currently editing and the project file list. Calls the Z AI LLM with a system
 * prompt that positions it as a CodeSync-embedded pair programmer, then returns
 * the assistant's reply as JSON.
 *
 * Auth: signed session cookie (requireUser) + at least READ access to the
 * project (getAccess + canRead).
 */

// Inline body schema — message is required, file context is optional.
const aiBodySchema = z.object({
  message: z.string().trim().min(1, 'message is required').max(4000, 'message too long'),
  activeFile: z
    .object({
      path: z.string().trim().min(1).max(300),
      content: z.string().max(500_000, 'file content too large'),
    })
    .optional(),
  allFiles: z
    .array(z.object({ path: z.string().trim().min(1).max(300) }))
    .max(500, 'too many files')
    .optional(),
})

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params

  // 1) Auth — require a signed-in auth.user.
  const auth = await requireUser(req)
  if (!auth.ok) return auth.error

  // 2) Authorize — must have at least READ access to the project.
  const { project, permission } = await getAccess(id, auth.user)
  if (!project) return error(404, 'Project not found')
  if (!canRead(permission)) return error(403, 'No access')

  // 3) Parse + validate the request body.
  const body = await req.json().catch(() => ({}))
  const parsed = validate(aiBodySchema, body)
  if ('error' in parsed) return parsed.error
  const { message, activeFile, allFiles } = parsed.data

  // 4) Build the LLM message array: system context + optional file context + auth.user message.
  const systemPrompt =
    `You are CodeSync AI, a pair-programming assistant embedded in a collaborative code editor. ` +
    `You help explain code, suggest improvements, debug issues, and refactor. ` +
    `Be concise and practical. When suggesting code, use markdown code fences. ` +
    `The auth.user is currently editing: ${activeFile?.path ?? 'no file'}`

  const messages: { role: 'system' | 'auth.user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ]

  if (activeFile) {
    messages.push({
      role: 'auth.user',
      content:
        `Here is the current file content (\`${activeFile.path}\`):\n` +
        '```\n' +
        `${activeFile.content}\n` +
        '```',
    })
    messages.push({
      role: 'assistant',
      content:
        `Got it — I have the contents of \`${activeFile.path}\` in context. ` +
        `What would you like to do with it?`,
    })
  }

  if (allFiles && allFiles.length > 0) {
    messages.push({
      role: 'auth.user',
      content: `Other files in the project: ${allFiles.map((f) => f.path).join(', ')}`,
    })
    messages.push({
      role: 'assistant',
      content: 'Noted — I can see the project file list. How can I help?',
    })
  }

  // The actual auth.user question / instruction goes last.
  messages.push({ role: 'auth.user', content: message })

  // 5) Call the LLM. Disable extended thinking for snappy responses.
  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
    })
    const reply = completion?.choices?.[0]?.message?.content
    if (!reply) {
      return error(502, 'AI returned an empty response')
    }
    return json({ reply })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown AI error'
    console.error('[ai/route] LLM call failed:', msg)
    return error(500, `AI request failed: ${msg}`)
  }
}
