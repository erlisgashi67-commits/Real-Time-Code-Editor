'use client'

import { useEffect, useRef } from 'react'

export interface ShortcutHandlers {
  onOpenPalette: () => void
  onOpenPaletteFiles: () => void
  onCommit: () => void
  onRun: () => void
  onToggleSidebar: () => void
  onFocusChat: () => void
}

/**
 * True when keyboard focus is inside a text-entry surface where global
 * shortcuts should be suppressed: form controls (INPUT/TEXTAREA/SELECT),
 * contenteditable regions, and the Monaco editor (which renders its own
 * hidden textarea inside `.monaco-editor`).
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  if (target.closest('.monaco-editor')) return true
  return false
}

/**
 * Registers global keyboard shortcuts for the IDE workspace.
 *
 * Shortcuts (Cmd on macOS, Ctrl elsewhere):
 *   - Cmd/Ctrl+Shift+P → open command palette (onOpenPalette)
 *   - Cmd/Ctrl+P       → open palette in file quick-open mode (onOpenPaletteFiles)
 *   - Cmd/Ctrl+S       → manual commit (onCommit)
 *   - Cmd/Ctrl+B       → toggle the file-tree sidebar (onToggleSidebar)
 *   - Cmd/Ctrl+Enter   → run code (onRun)
 *   - Cmd/Ctrl+/       → focus the chat input (onFocusChat)
 *
 * The two palette openers fire everywhere — including inside inputs and the
 * Monaco editor — so the palette is always reachable. Every other shortcut is
 * suppressed while typing in an input/textarea/Monaco so we never steal
 * keystrokes from the editor or form fields. Escape is intentionally not
 * handled here; closing the palette is delegated to the Radix Dialog.
 */
export function useShortcuts(handlers: ShortcutHandlers): void {
  // Keep the latest handlers in a ref so the keydown listener (registered
  // once) always invokes the current callbacks without re-binding. The ref is
  // updated in an effect (not during render) to comply with the React Hooks
  // refs rule.
  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const key = e.key.toLowerCase()
      const h = handlersRef.current

      // Palette openers work EVERYWHERE (even inside inputs / Monaco).
      if (key === 'p') {
        e.preventDefault()
        if (e.shiftKey) h.onOpenPalette()
        else h.onOpenPaletteFiles()
        return
      }

      // Remaining shortcuts are suppressed inside text-entry surfaces.
      if (isTypingTarget(e.target)) return

      switch (key) {
        case 's':
          e.preventDefault()
          h.onCommit()
          return
        case 'b':
          e.preventDefault()
          h.onToggleSidebar()
          return
        case 'enter':
          e.preventDefault()
          h.onRun()
          return
        case '/':
          e.preventDefault()
          h.onFocusChat()
          return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
