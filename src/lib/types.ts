/**
 * The authenticated user as seen by the client. This is the single source of
 * truth for the ClientUser type — every module that needs it imports from
 * here (directly or via re-exports from @/lib/session or @/lib/access).
 */
export interface ClientUser {
  id: string
  name: string
  email: string
  color: string
}

export interface FileNode {
  id: string
  path: string
  content: string
  updatedAt: string
}

export interface ProjectSummary {
  id: string
  name: string
  description: string
  template: string
  language: string
  ownerName: string
  fileCount: number
  collaboratorCount: number
  createdAt: string
  updatedAt: string
}

export interface VersionRecord {
  id: string
  message: string
  authorName: string
  hash: string
  parentHash: string | null
  createdAt: string
  filePath: string
}

export interface CommentRecord {
  id: string
  filePath: string
  lineNumber: number
  content: string
  authorName: string
  resolved: boolean
  createdAt: string
}

export interface ChatRecord {
  id: string
  authorName: string
  content: string
  system: boolean
  createdAt: string
}

export type Permission = 'READ' | 'WRITE' | 'ADMIN'

export interface ShareLinkRecord {
  id: string
  token: string
  permission: Permission
  createdAt: string
  expiresAt: string | null
}

export interface PresenceUser {
  id: string
  name: string
  color: string
}

export interface RunResult {
  ok: boolean
  output: string
  error?: string
  html?: string
  mode: 'iframe' | 'console' | 'text'
}
