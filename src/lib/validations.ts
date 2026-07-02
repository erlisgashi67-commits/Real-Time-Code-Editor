import { z } from 'zod'

/**
 * Centralized input validation for all API routes (P1 — validate every input).
 * Every mutation endpoint parses its body against a schema here before touching
 * the database. This prevents malformed / malicious payloads from reaching Prisma.
 */

// --- users / auth ---
export const signInSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(80),
  email: z.string().trim().toLowerCase().email('valid email is required').max(200),
})

// --- projects ---
export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(120),
  description: z.string().trim().max(1000).optional().or(z.literal('').transform(() => undefined)),
  templateId: z.string().trim().max(60).optional(),
})

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  isPublic: z.boolean().optional(),
})

// --- files ---
// File paths: allow letters, digits, dashes, underscores, dots, slashes. No
// leading slash, no double dots (prevents path traversal), no empty segments.
const pathSegmentRegex = /^[A-Za-z0-9._-]+$/
export const filePathSchema = z
  .string()
  .trim()
  .min(1, 'path is required')
  .max(300, 'path too long')
  .refine((p) => !p.startsWith('/'), 'path must be relative')
  .refine((p) => !p.includes('//'), 'path must not contain empty segments')
  .refine((p) => !p.split('/').some((seg) => seg === '..'), 'path traversal not allowed')
  .refine(
    (p) => p.split('/').every((seg) => pathSegmentRegex.test(seg)),
    'path contains invalid characters'
  )

export const createFileSchema = z.object({
  path: filePathSchema,
  content: z.string().max(5_000_000, 'file too large').optional().default(''),
})

export const updateFileSchema = z.object({
  content: z.string().max(5_000_000, 'file too large').optional(),
  path: filePathSchema.optional(),
})

// --- versions / commits ---
export const commitSchema = z.object({
  message: z.string().trim().min(1).max(200).optional().default('Save progress'),
  filePath: filePathSchema.optional(),
})

export const restoreVersionSchema = z.object({
  versionId: z.string().trim().min(1, 'versionId is required').max(60),
})

// --- comments ---
export const createCommentSchema = z.object({
  filePath: filePathSchema,
  lineNumber: z.number().int().min(1).max(100_000),
  content: z.string().trim().min(1, 'content is required').max(2000),
})

export const updateCommentSchema = z.object({
  resolved: z.boolean().optional(),
})

// --- chat ---
export const createChatSchema = z.object({
  content: z.string().trim().min(1, 'content is required').max(4000),
})

// --- share links ---
export const createShareLinkSchema = z.object({
  permission: z.enum(['READ', 'WRITE']).default('WRITE'),
  expiresAt: z.string().datetime().optional(),
})

// --- collaborators ---
export const createCollaboratorSchema = z.object({
  userName: z.string().trim().min(1, 'userName is required').max(80),
  email: z.string().trim().toLowerCase().email().max(200).optional().or(z.literal('').transform(() => undefined)),
  permission: z.enum(['READ', 'WRITE', 'ADMIN']).default('WRITE'),
})

// --- id params ---
export const cuidSchema = z.string().trim().min(1).max(60)

/** Parse a schema; returns `{ data }` on success or `{ error: Response }` on failure. */
export function validate<T>(schema: z.ZodType<T>, value: unknown):
  | { data: T }
  | { error: Response } {
  const result = schema.safeParse(value)
  if (result.success) return { data: result.data }
  const message = result.error.issues
    .map((i) => `${i.path.join('.') || 'value'}: ${i.message}`)
    .join('; ')
  return {
    error: new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }),
  }
}
