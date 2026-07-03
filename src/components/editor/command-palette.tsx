'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import { FileCode, FileText, File as FileIcon } from 'lucide-react'

export interface CommandItem {
  id: string
  label: string
  group: string
  icon?: React.ComponentType<{ className?: string }>
  hint?: string
  action: () => void
}

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  fileMode: boolean
  files: { id: string; path: string }[]
  commands: CommandItem[]
  /**
   * Optional. When provided the palette renders one quick-open entry per file
   * in `files` (icon chosen by extension) and invokes this callback on select.
   * When omitted, file-open entries should be supplied via `commands`
   * (group "File"). Either wiring is supported.
   */
  onOpenFile?: (file: { id: string; path: string }) => void
}

type IconType = React.ComponentType<{ className?: string }>

const FILE_ICONS: Record<string, IconType> = {
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

function fileIconFor(path: string): IconType {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  return FILE_ICONS[ext] || FileIcon
}

// Canonical group order. In fileMode the "File" group is promoted to the top
// (VS Code Cmd+P quick-open style); otherwise it sits last so the action
// categories lead the palette.
const GROUP_ORDER_FILE_MODE = ['File', 'Go', 'View', 'Run', 'Git', 'Share']
const GROUP_ORDER_NORMAL = ['Go', 'View', 'Run', 'Git', 'Share', 'File']

interface RenderedItem {
  /** Unique identifier for this rendered item (used as the React key prop).
   *  Named `id` — NOT `key` — to avoid confusion with the React reserved `key` prop. */
  id: string
  group: string
  label: string
  icon?: IconType
  hint?: string
  action: () => void
}

export function CommandPalette({
  open,
  onOpenChange,
  fileMode,
  files,
  commands,
  onOpenFile,
}: CommandPaletteProps) {
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange])

  // Build a merged, ordered group structure. The "File" group merges the
  // quick-open file entries (generated from `files` when `onOpenFile` is
  // supplied) with any command-supplied "File" items (e.g. "New File").
  const groups = React.useMemo(() => {
    const fileItems: RenderedItem[] =
      onOpenFile && files.length > 0
        ? files.map((f) => ({
            id: `file:${f.id}`,
            group: 'File',
            label: f.path,
            icon: fileIconFor(f.path),
            action: () => onOpenFile(f),
          }))
        : []

    const map = new Map<string, RenderedItem[]>()
    const ensure = (g: string): RenderedItem[] => {
      let arr = map.get(g)
      if (!arr) {
        arr = []
        map.set(g, arr)
      }
      return arr
    }

    if (fileItems.length > 0) ensure('File').push(...fileItems)

    for (const cmd of commands) {
      ensure(cmd.group).push({
        id: cmd.id,
        group: cmd.group,
        label: cmd.label,
        icon: cmd.icon,
        hint: cmd.hint,
        action: cmd.action,
      })
    }

    const order = fileMode ? GROUP_ORDER_FILE_MODE : GROUP_ORDER_NORMAL
    const ordered: { name: string; items: RenderedItem[] }[] = []
    const seen = new Set<string>()
    for (const g of order) {
      const items = map.get(g)
      if (items && items.length > 0) {
        ordered.push({ name: g, items })
        seen.add(g)
      }
    }
    // Append any unknown groups in first-seen order so custom categories
    // passed by the orchestrator still render.
    for (const [g, items] of map) {
      if (!seen.has(g) && items.length > 0) {
        ordered.push({ name: g, items })
      }
    }
    return ordered
  }, [commands, files, onOpenFile, fileMode])

  const title = fileMode ? 'Quick Open File' : 'Command Palette'
  const placeholder = fileMode
    ? 'Search files by name…'
    : 'Type a command or search…'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="dark max-w-2xl overflow-hidden p-0 border-slate-800 bg-slate-900 text-slate-100"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {fileMode ? 'Search for a file to open.' : 'Search for a command to run.'}
          </DialogDescription>
        </DialogHeader>
        <Command
          className="bg-slate-900 text-slate-100 [&_[cmdk-group-heading]]:text-slate-400 [&_[cmdk-input-wrapper]]:border-slate-800"
          filter={(value, search) =>
            value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder={placeholder} className="text-slate-100" />
          <CommandList className="max-h-[60vh]">
            {groups.map((g) => (
              <CommandGroup
                key={g.name}
                heading={fileMode && g.name === 'File' ? 'Files' : g.name}
              >
                {g.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <CommandItem
                      key={item.id}
                      value={`${item.group} ${item.label} ${item.id}`}
                      onSelect={() => {
                        item.action()
                        close()
                      }}
                      className="text-slate-200 data-[selected=true]:bg-emerald-500/15 data-[selected=true]:text-emerald-300"
                    >
                      {Icon && <Icon className="size-4 shrink-0 text-emerald-400" />}
                      <span className="truncate flex-1">{item.label}</span>
                      {item.hint && (
                        <CommandShortcut className="text-slate-500">
                          {item.hint}
                        </CommandShortcut>
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
            <CommandEmpty>
              {fileMode && files.length === 0
                ? 'No files in this project yet.'
                : 'No matching results.'}
            </CommandEmpty>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
