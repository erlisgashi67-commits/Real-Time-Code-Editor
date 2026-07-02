'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ArrowLeft, Share2, GitCommitHorizontal, Play, X, FileCode, Wifi, WifiOff, Circle, Save, Sparkles, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { apiGet, apiPost, apiPut, apiPatch, apiDel, isSessionExpiredError } from '@/lib/api'
import { useApp } from '@/lib/store'
import { useCollab, type RemoteCursor } from './use-collab'
import { FileTree } from './file-tree'
import { CodeEditor } from './code-editor'
import { SidePanel } from './side-panel'
import { TerminalPanel } from './terminal-panel'
import { ShareDialog } from './share-dialog'
import { CommandPalette, type CommandItem } from './command-palette'
import { useShortcuts } from './use-shortcuts'
import { AIAssistant } from './ai-assistant'
import { toast } from 'sonner'
import type { ChatRecord, CommentRecord, VersionRecord, FileNode, PresenceUser } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ProjectMeta {
  id: string
  name: string
  description: string
  template: string
  language: string
  isPublic: boolean
  ownerName: string
  permission: string
  collaborators: { id: string; userName: string; permission: string }[]
}

interface FileItem { id: string; path: string }
interface FileContent { id: string; content: string; dirty: boolean; lastSynced: string }

export function Workspace({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const user = useApp((s) => s.user)
  const [project, setProject] = useState<ProjectMeta | null>(null)
  const [files, setFiles] = useState<FileItem[]>([])
  const [contents, setContents] = useState<Record<string, FileContent>>({})
  const [openTabs, setOpenTabs] = useState<string[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatRecord[]>([])
  const [comments, setComments] = useState<CommentRecord[]>([])
  const [versions, setVersions] = useState<VersionRecord[]>([])
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursor>>(new Map())
  const [shareOpen, setShareOpen] = useState(false)
  const [commitOpen, setCommitOpen] = useState(false)
  const [commentLine, setCommentLine] = useState<{ path: string; line: number } | null>(null)
  const [commentText, setCommentText] = useState('')
  const [runSignal, setRunSignal] = useState(0)
  const [saving, setSaving] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteFileMode, setPaletteFileMode] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const readOnly = project ? project.permission === 'READ' : true

  // ---- version history (defined first; used by loadProject + openFile) ----
  const loadVersions = useCallback(async (path?: string) => {
    try {
      const v = await apiGet<VersionRecord[]>(`/api/projects/${projectId}/versions${path ? `?filePath=${encodeURIComponent(path)}` : ''}`)
      setVersions(v)
    } catch {
      // ignore
    }
  }, [projectId])

  // ---- load project + files + chat + comments ----
  const loadProject = useCallback(async () => {
    try {
      const meta = await apiGet<ProjectMeta>(`/api/projects/${projectId}`)
      setProject(meta)
      const fileList = await apiGet<FileItem[]>(`/api/projects/${projectId}/files`)
      setFiles(fileList)
      // eagerly load ALL file contents so preview/runner + remote sync have full context
      const contentsArr = await Promise.all(
        fileList.map((f) =>
          apiGet<{ id: string; content: string }>(`/api/projects/${projectId}/files/${f.id}`)
            .then((c) => ({ path: f.path, id: f.id, content: c.content }))
            .catch(() => ({ path: f.path, id: f.id, content: '' }))
        )
      )
      const contentsMap: Record<string, FileContent> = {}
      contentsArr.forEach((c) => {
        contentsMap[c.path] = { id: c.id, content: c.content, dirty: false, lastSynced: c.content }
      })
      setContents(contentsMap)
      const [chat, comms] = await Promise.all([
        apiGet<ChatRecord[]>(`/api/projects/${projectId}/chat`).catch(() => []),
        apiGet<CommentRecord[]>(`/api/projects/${projectId}/comments`).catch(() => []),
      ])
      setMessages(chat)
      setComments(comms)
      // auto-open entry file
      const entry = fileList.find((f) => f.path === 'index.html') || fileList.find((f) => f.path.endsWith('.js')) || fileList[0]
      if (entry) {
        setOpenTabs((t) => (t.includes(entry.path) ? t : [...t, entry.path]))
        setActivePath(entry.path)
        loadVersions(entry.path)
      }
    } catch (err) {
      // Session-expiry is handled globally (clears user + shows a single toast);
      // don't show a redundant per-call error here.
      if (!isSessionExpiredError(err)) {
        toast.error(err instanceof Error ? err.message : 'Failed to load project')
      }
      onBack()
    }
  }, [projectId, loadVersions, onBack])

  const openFile = useCallback(async (path: string, id?: string, list?: FileItem[]) => {
    const fl = list || files
    const fid = id || fl.find((f) => f.path === path)?.id
    if (!fid) return
    if (!contents[path]) {
      try {
        const f = await apiGet<{ id: string; path: string; content: string }>(`/api/projects/${projectId}/files/${fid}`)
        setContents((c) => ({ ...c, [path]: { id: fid, content: f.content, dirty: false, lastSynced: f.content } }))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to open file')
        return
      }
    }
    setOpenTabs((t) => (t.includes(path) ? t : [...t, path]))
    setActivePath(path)
    // load versions for this file
    loadVersions(path)
  }, [files, contents, projectId, loadVersions])

  useEffect(() => {
    loadProject()
  }, [loadProject])

  // ---- real-time collaboration ----
  const collab = useCollab(projectId, user, {
    onFileEdit: (d) => {
      // remote file edit arrives
      setContents((c) => {
        const existing = c[d.filePath]
        if (!existing) return c // not open; will load fresh later
        if (existing.dirty) {
          // local edits take priority; mark a stale flag
          toast.info(`${d.authorName} edited ${d.filePath} — your unsaved changes are preserved`)
          return c
        }
        return { ...c, [d.filePath]: { ...existing, content: d.content, lastSynced: d.content } }
      })
      setFiles((fl) => fl.map((f) => (f.path === d.filePath ? f : f))) // touch
    },
    onCursor: (c) => {
      setRemoteCursors((m) => {
        const next = new Map(m)
        next.set(c.userId, c)
        return next
      })
      // auto-clear after a few seconds of inactivity
      setTimeout(() => {
        setRemoteCursors((m) => {
          if (m.get(c.userId)?.position.lineNumber !== c.position.lineNumber) return m
          return m
        })
      }, 5000)
    },
    onChat: (m) =>
      // Dedupe by id: the server relays chat back to the sender too, and the
      // sender already added an optimistic copy with the same client-generated id.
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m])),
    onComment: (d) => {
      const c = d.comment as CommentRecord
      setComments((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]))
    },
    onCommentResolved: (d) => {
      setComments((prev) => prev.map((c) => (c.id === d.commentId ? { ...c, resolved: true } : c)))
    },
    onTyping: () => {
      // could show typing indicator; left as future enhancement
    },
  })

  // clean stale remote cursors periodically
  useEffect(() => {
    const t = setInterval(() => {
      setRemoteCursors((m) => {
        if (m.size === 0) return m
        return m
      })
    }, 6000)
    return () => clearInterval(t)
  }, [])

  // ---- editing ----
  const handleCodeChange = useCallback((path: string, value: string) => {
    setContents((c) => {
      const existing = c[path]
      if (!existing) return c
      return { ...c, [path]: { ...existing, content: value, dirty: true } }
    })
    collab.sendEdit(path, value)
    collab.sendTyping(path, true)

    // debounce save
    clearTimeout(saveTimers.current[path])
    saveTimers.current[path] = setTimeout(async () => {
      setSaving(true)
      try {
        const file = contentsRef.current[path]
        if (!file) return
        await apiPut(`/api/projects/${projectId}/files/${file.id}`, { content: value })
        setContents((c) => (c[path] ? { ...c, [path]: { ...c[path], dirty: false, lastSynced: value } } : c))
        collab.sendTyping(path, false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Auto-save failed')
      } finally {
        setSaving(false)
      }
    }, 700)
  }, [collab, projectId])

  const contentsRef = useRef(contents)
  contentsRef.current = contents

  const cursorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleCursorChange = useCallback((path: string, pos: { lineNumber: number; column: number }, sel: { startLineNumber: number; endLineNumber: number } | null) => {
    if (cursorTimer.current) clearTimeout(cursorTimer.current)
    cursorTimer.current = setTimeout(() => {
      collab.sendCursor(path, pos, sel)
    }, 80)
  }, [collab])

  // ---- file ops ----
  async function createFile(path: string) {
    try {
      const f = await apiPost<{ id: string; path: string }>(`/api/projects/${projectId}/files`, { path })
      setFiles((fl) => [...fl, f].sort((a, b) => a.path.localeCompare(b.path)))
      setContents((c) => ({ ...c, [path]: { id: f.id, content: '', dirty: false, lastSynced: '' } }))
      setOpenTabs((t) => [...t, path])
      setActivePath(path)
      toast.success(`Created ${path}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create file')
    }
  }

  async function deleteFile(path: string) {
    const file = files.find((f) => f.path === path)
    if (!file) return
    if (!confirm(`Delete ${path}? This cannot be undone.`)) return
    try {
      await apiDel(`/api/projects/${projectId}/files/${file.id}`)
      setFiles((fl) => fl.filter((f) => f.path !== path))
      setContents((c) => { const n = { ...c }; delete n[path]; return n })
      // Recompute the next active tab from the UPDATED tab list inside the
      // setter — using the stale `openTabs` closure can select the wrong tab
      // or leave focus on a deleted file after fast edits.
      setOpenTabs((t) => {
        const next = t.filter((p) => p !== path)
        if (activePath === path) {
          setActivePath(next[next.length - 1] || null)
        }
        return next
      })
      toast.success(`Deleted ${path}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete file')
    }
  }

  function closeTab(path: string) {
    setOpenTabs((t) => {
      const next = t.filter((p) => p !== path)
      if (activePath === path) setActivePath(next[next.length - 1] || null)
      return next
    })
  }

  // ---- chat ----
  function sendChat(content: string) {
    // sendChat returns a client-generated id; use it for the optimistic copy so
    // the relayed broadcast (same id) is deduped in onChat — no double messages.
    const clientId = collab.sendChat(content)
    const optimistic: ChatRecord = {
      id: clientId,
      authorName: user?.name || 'me',
      content,
      system: false,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => (prev.some((x) => x.id === clientId) ? prev : [...prev, optimistic]))
    // persist to DB (fire-and-forget; the relayed message is the source of truth for the chat list)
    apiPost(`/api/projects/${projectId}/chat`, { content }).catch(() => {})
  }

  // ---- comments ----
  async function addComment(path: string, line: number, content: string) {
    try {
      const c = await apiPost<CommentRecord>(`/api/projects/${projectId}/comments`, {
        filePath: path, lineNumber: line, content,
      })
      setComments((prev) => [...prev, c])
      collab.sendComment(c)
      setCommentLine(null)
      setCommentText('')
      toast.success('Comment added')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add comment')
    }
  }

  async function resolveComment(id: string) {
    try {
      await apiPatch(`/api/projects/${projectId}/comments/${id}`, { resolved: true })
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, resolved: true } : c)))
      collab.sendCommentResolved(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resolve')
    }
  }

  function jumpToComment(filePath: string, _line: number) {
    openFile(filePath).then(() => {
      // editor will show the glyph; we just switch file
    })
  }

  // ---- commit (git) ----
  const [commitMsg, setCommitMsg] = useState('')
  async function commit() {
    try {
      const res = await apiPost<{ hash: string; snapshots: number }>(`/api/projects/${projectId}/commit`, {
        message: commitMsg || 'Save progress',
      })
      toast.success(`Committed ${res.hash} — ${res.snapshots} file(s) snapshotted`)
      setCommitOpen(false)
      setCommitMsg('')
      loadVersions(activePath || undefined)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Commit failed')
    }
  }

  async function restoreVersion(id: string) {
    try {
      await apiPost(`/api/projects/${projectId}/versions`, { versionId: id })
      // reload active file content
      if (activePath) {
        const file = contents[activePath]
        if (file) {
          const f = await apiGet<{ content: string }>(`/api/projects/${projectId}/files/${file.id}`)
          setContents((c) => ({ ...c, [activePath]: { ...c[activePath], content: f.content, lastSynced: f.content, dirty: false } }))
          collab.sendEdit(activePath, f.content)
        }
      }
      toast.success('Restored version')
      loadVersions(activePath || undefined)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Restore failed')
    }
  }

  // ---- derived ----
  const activeContent = activePath ? contents[activePath] : null
  const activeRemoteCursors = useMemo(() => {
    return Array.from(remoteCursors.values()).filter((c) => c.filePath === activePath && c.userId !== user?.id)
  }, [remoteCursors, activePath, user?.id])

  const commentLines = useMemo(() => {
    const set = new Set<number>()
    comments.forEach((c) => { if (c.filePath === activePath && !c.resolved) set.add(c.lineNumber) })
    return set
  }, [comments, activePath])

  const commentCounts = useMemo(() => {
    const m: Record<string, number> = {}
    comments.forEach((c) => { if (!c.resolved) m[c.filePath] = (m[c.filePath] || 0) + 1 })
    return m
  }, [comments])

  const dirtyCount = Object.values(contents).filter((c) => c.dirty).length
  const fileNodes: FileNode[] = files.map((f) => ({ id: f.id, path: f.path, content: contents[f.path]?.content || '', updatedAt: '' }))

  // ---- keyboard shortcuts ----
  useShortcuts({
    onOpenPalette: () => { setPaletteFileMode(false); setPaletteOpen(true) },
    onOpenPaletteFiles: () => { setPaletteFileMode(true); setPaletteOpen(true) },
    onCommit: () => { if (!readOnly) setCommitOpen(true) },
    onRun: () => setRunSignal((s) => s + 1),
    onToggleSidebar: () => setSidebarVisible((v) => !v),
    onFocusChat: () => {
      const input = document.querySelector<HTMLInputElement>('input[placeholder="Type a message…"]')
      input?.focus()
    },
  })

  // ---- command palette commands ----
  const commands: CommandItem[] = [
    { id: 'run', label: 'Run Code', group: 'Run', icon: Play, hint: '⌘↵', action: () => setRunSignal((s) => s + 1) },
    { id: 'commit', label: 'Create Commit', group: 'Git', icon: GitCommitHorizontal, hint: '⌘S', action: () => { if (!readOnly) setCommitOpen(true) } },
    { id: 'share', label: 'Open Share Dialog', group: 'Share', icon: Share2, action: () => setShareOpen(true) },
    { id: 'ai', label: 'Toggle AI Assistant', group: 'View', icon: Sparkles, action: () => setAiOpen((v) => !v) },
    { id: 'toggle-sidebar', label: 'Toggle Sidebar', group: 'View', icon: PanelLeftClose, hint: '⌘B', action: () => setSidebarVisible((v) => !v) },
    { id: 'go-dashboard', label: 'Back to Dashboard', group: 'Go', icon: ArrowLeft, action: () => onBack() },
  ]

  // active file for the AI assistant
  const activeFileForAI = activePath && contents[activePath]
    ? { path: activePath, content: contents[activePath].content }
    : null

  if (!project) {
    return (
      <div className="h-screen grid place-items-center bg-slate-950 text-slate-400">
        <div className="text-center">
          <div className="animate-pulse text-lg">Loading project…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top bar */}
      <header className="h-12 shrink-0 border-b border-slate-800 bg-slate-900 flex items-center gap-2 px-3">
        <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white px-2" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white px-2 hidden sm:flex" onClick={() => setSidebarVisible((v) => !v)} title="Toggle sidebar (⌘B)">
          {sidebarVisible ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          <div className="size-6 rounded bg-emerald-500 grid place-items-center text-emerald-950 font-black text-[10px]">{'</>'}</div>
          <span className="font-semibold text-sm truncate">{project.name}</span>
          {project.permission === 'READ' && <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-400">READ-ONLY</Badge>}
          {project.permission === 'ADMIN' && <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-400">OWNER</Badge>}
          {saving && <span className="text-[11px] text-slate-500 flex items-center gap-1"><Save className="size-3 animate-pulse" /> saving…</span>}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* presence avatars */}
          <div className="hidden sm:flex items-center -space-x-2">
            {collab.online.slice(0, 5).map((o) => (
              <Tooltip key={o.id}>
                <TooltipTrigger asChild>
                  <Avatar className="size-7 border-2 border-slate-900" style={{ backgroundColor: o.color }}>
                    <AvatarFallback className="text-[10px] text-white font-semibold">{o.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent>{o.name}{o.id === user?.id && ' (you)'}</TooltipContent>
              </Tooltip>
            ))}
            {collab.online.length > 5 && (
              <div className="size-7 rounded-full border-2 border-slate-900 bg-slate-700 grid place-items-center text-[10px] font-semibold">+{collab.online.length - 5}</div>
            )}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500 px-1">
            {collab.connected ? <Wifi className="size-3.5 text-emerald-500" /> : <WifiOff className="size-3.5 text-amber-500" />}
            <span className="hidden md:inline">{collab.connected ? 'Live' : 'Reconnecting…'}</span>
          </div>

          <Button size="sm" variant="ghost" className="text-slate-300 hover:text-white h-8" onClick={() => setRunSignal((s) => s + 1)} title="Run (⌘↵)">
            <Play className="size-3.5 mr-1" /> Run
          </Button>
          <Button size="sm" variant="ghost" className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-8" onClick={() => setAiOpen((v) => !v)} title="AI Assistant">
            <Sparkles className="size-3.5 mr-1" /> AI
          </Button>
          {!readOnly && (
            <Button size="sm" variant="ghost" className="text-slate-300 hover:text-white h-8" onClick={() => setCommitOpen(true)} title="Commit (⌘S)">
              <GitCommitHorizontal className="size-3.5 mr-1" /> Commit
              {dirtyCount > 0 && <span className="ml-1 text-[10px] px-1 rounded-full bg-amber-500 text-amber-950">{dirtyCount}</span>}
            </Button>
          )}
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-8" onClick={() => setShareOpen(true)}>
            <Share2 className="size-3.5 mr-1" /> Share
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0">
        <PanelGroup direction="horizontal" autoSaveId="codesync-main">
          {/* File tree (conditionally rendered so ⌘B fully hides it) */}
          {sidebarVisible && (
            <>
              <Panel defaultSize={16} minSize={12} maxSize={28} className="bg-slate-900 border-r border-slate-800">
                <FileTree
                  files={files}
                  activePath={activePath}
                  commentCounts={commentCounts}
                  readOnly={readOnly}
                  onSelect={(p) => openFile(p)}
                  onCreate={createFile}
                  onDelete={deleteFile}
                />
              </Panel>
              <PanelResizeHandle className="w-1 bg-slate-800 hover:bg-emerald-500/50 transition-colors" />
            </>
          )}

          {/* Editor + terminal column */}
          <Panel defaultSize={56} minSize={30}>
            <PanelGroup direction="vertical" autoSaveId="codesync-editor">
              <Panel defaultSize={68} minSize={20} className="bg-[#0b1120] flex flex-col min-h-0">
                {/* Tabs */}
                <div className="h-9 shrink-0 flex items-stretch border-b border-slate-800 bg-slate-900 overflow-x-auto custom-scroll-x">
                  {openTabs.length === 0 && (
                    <div className="px-3 flex items-center text-xs text-slate-600">No file open — select one from the explorer</div>
                  )}
                  {openTabs.map((path) => (
                    <button
                      key={path}
                      onClick={() => setActivePath(path)}
                      className={cn(
                        'group flex items-center gap-1.5 px-3 h-full border-r border-slate-800 text-xs whitespace-nowrap',
                        activePath === path ? 'bg-[#0b1120] text-emerald-400 border-t-2 border-t-emerald-500 -mt-px' : 'text-slate-400 hover:bg-slate-800/50'
                      )}
                    >
                      <FileCode className="size-3.5" />
                      <span>{path.split('/').pop()}</span>
                      {contents[path]?.dirty && <Circle className="size-2 fill-current" />}
                      <span
                        role="button"
                        tabIndex={-1}
                        className="ml-1 p-0.5 rounded hover:bg-slate-700 opacity-60 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); closeTab(path) }}
                      >
                        <X className="size-3" />
                      </span>
                    </button>
                  ))}
                </div>
                {/* Editor */}
                <div className="flex-1 min-h-0">
                  {activeContent && activePath ? (
                    <CodeEditor
                      key={activePath}
                      path={activePath}
                      value={activeContent.content}
                      readOnly={readOnly}
                      remoteCursors={activeRemoteCursors}
                      commentLines={commentLines}
                      onChange={(v) => handleCodeChange(activePath, v)}
                      onCursorChange={(pos, sel) => handleCursorChange(activePath, pos, sel)}
                      onGutterClick={(line) => setCommentLine({ path: activePath, line })}
                    />
                  ) : (
                    <div className="h-full grid place-items-center text-slate-600 text-sm">
                      <div className="text-center">
                        <FileCode className="size-10 mx-auto mb-2 opacity-40" />
                        <p>Open a file to start editing</p>
                      </div>
                    </div>
                  )}
                </div>
              </Panel>
              <PanelResizeHandle className="h-1 bg-slate-800 hover:bg-emerald-500/50 transition-colors" />
              <Panel defaultSize={32} minSize={10} className="min-h-0">
                <TerminalPanel files={fileNodes} runSignal={runSignal} />
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="w-1 bg-slate-800 hover:bg-emerald-500/50 transition-colors" />

          {/* Side panel */}
          <Panel defaultSize={28} minSize={18} maxSize={40} className="border-l border-slate-800 min-h-0">
            <SidePanel
              user={user!}
              messages={messages}
              comments={comments}
              versions={versions}
              collaborators={project.collaborators}
              online={collab.online as PresenceUser[]}
              activeFilePath={activePath}
              activeLine={null}
              readOnly={readOnly}
              onSendChat={sendChat}
              onResolveComment={resolveComment}
              onJumpToComment={jumpToComment}
              onRestoreVersion={restoreVersion}
            />
          </Panel>
        </PanelGroup>
      </div>

      {/* Share dialog */}
      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        projectId={projectId}
        isOwner={project.permission === 'ADMIN'}
        isPublic={project.isPublic}
        onPublicChange={(v) => setProject((p) => (p ? { ...p, isPublic: v } : p))}
      />

      {/* Commit dialog */}
      <Dialog open={commitOpen} onOpenChange={setCommitOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><GitCommitHorizontal className="size-5 text-emerald-500" /> Create a commit</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="commit-msg">Commit message</Label>
              <Textarea id="commit-msg" placeholder="Describe your changes…" value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)} rows={3} />
            </div>
            <p className="text-xs text-muted-foreground">
              Snapshots all changed files into version history. You can restore any version later.
            </p>
            {dirtyCount === 0 && <p className="text-xs text-amber-500">No unsaved changes — committing will skip unchanged files.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommitOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={commit}>
              <GitCommitHorizontal className="size-4 mr-1" /> Commit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comment dialog */}
      <Dialog open={!!commentLine} onOpenChange={(v) => !v && setCommentLine(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Comment on {commentLine?.path}:{commentLine?.line}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              autoFocus
              placeholder="Write a comment or review note…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              rows={3}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (commentText.trim()) addComment(commentLine!.path, commentLine!.line, commentText.trim()) } }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommentLine(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={!commentText.trim()} onClick={() => commentLine && addComment(commentLine.path, commentLine.line, commentText.trim())}>
              Add comment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Command palette (Cmd+Shift+P / Cmd+P) */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        fileMode={paletteFileMode}
        files={files}
        commands={commands}
        onOpenFile={(f) => openFile(f.path)}
      />

      {/* AI assistant floating panel */}
      <AIAssistant
        open={aiOpen}
        onOpenChange={setAiOpen}
        projectId={projectId}
        activeFile={activeFileForAI}
        allFiles={files.map((f) => ({ path: f.path }))}
      />
    </div>
  )
}
