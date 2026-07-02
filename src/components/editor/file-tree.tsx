'use client'

import { useState, useMemo, createElement } from 'react'
import { File, FileCode, FileText, Folder, FolderOpen, Plus, Trash2, ChevronRight, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface FileItem {
  id: string
  path: string
}

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  file?: FileItem
  children: Map<string, TreeNode>
}

const FILE_ICONS: Record<string, typeof File> = {
  js: FileCode,
  jsx: FileCode,
  ts: FileCode,
  tsx: FileCode,
  html: FileCode,
  css: FileCode,
  json: FileCode,
  py: FileCode,
  md: FileText,
}

function buildTree(files: FileItem[]): TreeNode {
  const root: TreeNode = { name: '', path: '', isDir: true, children: new Map() }
  for (const f of files) {
    const parts = f.path.split('/')
    let node = root
    let acc = ''
    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part
      const isLast = i === parts.length - 1
      let child = node.children.get(part)
      if (!child) {
        child = { name: part, path: acc, isDir: !isLast, children: new Map(), file: isLast ? f : undefined }
        node.children.set(part, child)
      }
      node = child
    })
  }
  return root
}

/** Stable icon component — looks up the right lucide icon by file extension. */
function FileIcon({ name, className }: { name: string; className?: string }) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const type = FILE_ICONS[ext] || File
  return createElement(type, { className })
}

export function FileTree({
  files,
  activePath,
  commentCounts,
  readOnly,
  onSelect,
  onCreate,
  onDelete,
}: {
  files: FileItem[]
  activePath: string | null
  commentCounts: Record<string, number>
  readOnly: boolean
  onSelect: (path: string) => void
  onCreate: (path: string) => void
  onDelete: (path: string) => void
}) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const tree = useMemo(() => buildTree(files), [files])

  function handleCreate() {
    const name = newName.trim()
    if (!name) {
      setCreating(false)
      return
    }
    onCreate(name)
    setNewName('')
    setCreating(false)
  }

  return (
    <div className="h-full flex flex-col text-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Explorer</span>
        {!readOnly && (
          <Button variant="ghost" size="icon" className="size-6" onClick={() => setCreating(true)} title="New file">
            <Plus className="size-3.5" />
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-1 custom-scroll">
        {creating && (
          <div className="px-2 py-1">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') { setCreating(false); setNewName('') }
              }}
              placeholder="filename.ext"
              className="h-7 text-xs"
            />
          </div>
        )}
        {files.length === 0 && !creating && (
          <div className="px-3 py-6 text-xs text-muted-foreground text-center">No files yet</div>
        )}
        <TreeChildren node={tree} depth={0} activePath={activePath} commentCounts={commentCounts} readOnly={readOnly} onSelect={onSelect} onDelete={onDelete} />
      </div>
    </div>
  )
}

function TreeChildren({
  node,
  depth,
  activePath,
  commentCounts,
  readOnly,
  onSelect,
  onDelete,
}: {
  node: TreeNode
  depth: number
  activePath: string | null
  commentCounts: Record<string, number>
  readOnly: boolean
  onSelect: (path: string) => void
  onDelete: (path: string) => void
}) {
  const entries = Array.from(node.children.values()).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return (
    <>
      {entries.map((child) =>
        child.isDir ? (
          <FolderRow key={child.path} node={child} depth={depth} activePath={activePath} commentCounts={commentCounts} readOnly={readOnly} onSelect={onSelect} onDelete={onDelete} />
        ) : (
          <FileRow key={child.path} node={child} depth={depth} activePath={activePath} commentCounts={commentCounts} readOnly={readOnly} onSelect={onSelect} onDelete={onDelete} />
        )
      )}
    </>
  )
}

function FolderRow(props: { node: TreeNode; depth: number; activePath: string | null; commentCounts: Record<string, number>; readOnly: boolean; onSelect: (p: string) => void; onDelete: (p: string) => void }) {
  const [open, setOpen] = useState(true)
  const { node, depth, ...rest } = props
  return (
    <div>
      <button
        className="w-full flex items-center gap-1 px-2 py-1 hover:bg-muted/60 text-left"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
        {open ? <FolderOpen className="size-4 text-amber-500" /> : <Folder className="size-4 text-amber-500" />}
        <span className="truncate">{node.name}</span>
      </button>
      {open && <TreeChildren node={node} depth={depth + 1} {...rest} />}
    </div>
  )
}

function FileRow({ node, depth, activePath, commentCounts, readOnly, onSelect, onDelete }: {
  node: TreeNode
  depth: number
  activePath: string | null
  commentCounts: Record<string, number>
  readOnly: boolean
  onSelect: (p: string) => void
  onDelete: (p: string) => void
}) {
  const active = activePath === node.path
  const comments = commentCounts[node.path] || 0
  return (
    <div
      className={cn(
        'group w-full flex items-center gap-1.5 px-2 py-1 cursor-pointer text-left',
        active ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'hover:bg-muted/60'
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      onClick={() => onSelect(node.path)}
    >
      <span className="w-3.5" />
      <FileIcon name={node.name} className={cn('size-4 shrink-0', active ? 'text-emerald-500' : 'text-muted-foreground')} />
      <span className="truncate flex-1">{node.name}</span>
      {comments > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{comments}</span>
      )}
      {!readOnly && (
        <button
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-0.5"
          onClick={(e) => { e.stopPropagation(); onDelete(node.path) }}
          title="Delete file"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  )
}
