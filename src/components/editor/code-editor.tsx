'use client'

import { useRef, useEffect, useCallback } from 'react'
import Editor, { type OnMount, type BeforeMount } from '@monaco-editor/react'
import type { editor as MEditor, IDisposable } from 'monaco-editor'
import type { RemoteCursor } from './use-collab'

const LANG_BY_EXT: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  html: 'html', htm: 'html',
  css: 'css', scss: 'scss',
  json: 'json',
  md: 'markdown', markdown: 'markdown',
  py: 'python',
  txt: 'plaintext',
}

export function languageForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  return LANG_BY_EXT[ext] || 'plaintext'
}

interface Props {
  path: string
  value: string
  readOnly: boolean
  remoteCursors: RemoteCursor[]
  commentLines: Set<number>
  onChange: (value: string) => void
  onCursorChange: (pos: { lineNumber: number; column: number }, sel: { startLineNumber: number; endLineNumber: number } | null) => void
  onGutterClick: (line: number) => void
}

export function CodeEditor({
  path,
  value,
  readOnly,
  remoteCursors,
  commentLines,
  onChange,
  onCursorChange,
  onGutterClick,
}: Props) {
  const editorRef = useRef<MEditor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)
  const decorationsRef = useRef<string[]>([])
  const widgetsRef = useRef<Map<string, { id: string; el: HTMLDivElement & { __widget?: MEditor.IContentWidget } }>>(new Map())
  const gutterSubRef = useRef<IDisposable | null>(null)
  const cursorSubRef = useRef<IDisposable | null>(null)
  const modelChangeRef = useRef(false)

  // keep latest props available to imperative helpers
  const propsRef = useRef({ remoteCursors, commentLines })
  useEffect(() => {
    propsRef.current = { remoteCursors, commentLines }
  })

  const syncWidgets = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const { remoteCursors: cursors } = propsRef.current
    const active = new Set<string>()
    cursors.forEach((c) => {
      const key = c.userId
      active.add(key)
      const safeLine = Math.max(1, c.position.lineNumber)
      const existing = widgetsRef.current.get(key)
      const domNode = existing?.el || document.createElement('div')
      domNode.className = 'remote-cursor-flag'
      domNode.style.backgroundColor = c.color
      domNode.textContent = c.name

      const widget: MEditor.IContentWidget = {
        getId: () => `remote-flag-${key}`,
        getDomNode: () => domNode,
        getPosition: () => ({
          position: { lineNumber: safeLine, column: Math.max(1, c.position.column) },
          preference: [1, 2],
        }),
      }
      if (!existing) {
        editor.addContentWidget(widget)
        widgetsRef.current.set(key, { id: key, el: domNode })
      } else {
        editor.layoutContentWidget(widget)
      }
      ;(domNode as HTMLDivElement & { __widget?: MEditor.IContentWidget }).__widget = widget
    })
    widgetsRef.current.forEach((entry, key) => {
      if (!active.has(key)) {
        if (entry.el.__widget) editor.removeContentWidget(entry.el.__widget)
        widgetsRef.current.delete(key)
      }
    })
  }, [])

  const updateDecorations = useCallback(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return
    const { remoteCursors: cursors, commentLines: lines } = propsRef.current

    const decos: MEditor.IModelDeltaDecoration[] = []

    lines.forEach((line) => {
      decos.push({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: 'codesync-comment-glyph',
          glyphMarginHoverMessage: { value: 'Comment thread — click to view' },
          stickiness: 1,
        },
      })
    })

    cursors.forEach((c) => {
      const safeLine = Math.max(1, c.position.lineNumber)
      decos.push({
        range: new monaco.Range(safeLine, c.position.column, safeLine, c.position.column),
        options: {
          isWholeLine: true,
          className: 'remote-cursor-line',
          beforeContentClassName: 'remote-cursor-caret',
          stickiness: 1,
        },
      })
    })

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decos)
    syncWidgets()
  }, [syncWidgets])

  const handleBeforeMount: BeforeMount = (monaco) => {
    monacoRef.current = monaco
    monaco.editor.defineTheme('codesync-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#0b1120',
        'editorGutter.background': '#0b1120',
        'editorLineNumber.foreground': '#475569',
        'editorLineNumber.activeForeground': '#94a3b8',
        'editor.selectionBackground': '#10b98133',
        'editor.lineHighlightBackground': '#1e293b80',
        'editorCursor.foreground': '#34d399',
        'editorIndentGuide.background': '#1e293b',
      },
    })
  }

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    gutterSubRef.current = editor.onMouseDown((e) => {
      if (e.target.type === 2) {
        onGutterClick(e.target.position.lineNumber)
      }
    })
    cursorSubRef.current = editor.onDidChangeCursorPosition((e) => {
      const sel = editor.getSelection()
      const selection =
        sel && sel.startLineNumber !== sel.endLineNumber
          ? { startLineNumber: sel.startLineNumber, endLineNumber: sel.endLineNumber }
          : null
      onCursorChange({ lineNumber: e.position.lineNumber, column: e.position.column }, selection)
    })
    updateDecorations()
  }

  // apply external value changes (remote edits) without losing cursor
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (modelChangeRef.current) { modelChangeRef.current = false; return }
    const current = editor.getValue()
    if (current !== value) {
      const pos = editor.getPosition()
      editor.executeEdits('remote', [
        {
          range: editor.getModel()!.getFullModelRange(),
          text: value,
          forceMoveMarkers: true,
        },
      ])
      if (pos) editor.setPosition(pos)
    }
  }, [value])

  // refresh decorations + widgets when cursors / comments / file change
  useEffect(() => {
    updateDecorations()
  }, [updateDecorations, remoteCursors, commentLines, path])

  useEffect(() => {
    return () => {
      gutterSubRef.current?.dispose()
      cursorSubRef.current?.dispose()
    }
  }, [])

  function handleMountChange(val: string | undefined) {
    const next = val ?? ''
    // If the new value equals the controlled `value` prop, this change was caused
    // by us applying a remote edit (executeEdits) — NOT a user keystroke. Skip
    // propagating it upstream so we don't mark the file dirty or echo an edit back.
    if (next === value) {
      return
    }
    modelChangeRef.current = true
    onChange(next)
  }

  return (
    <div className="relative h-full w-full bg-[#0b1120]">
      <style>{`
        .codesync-comment-glyph {
          background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path fill='%23f59e0b' d='M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6l-3 3v-3H3a1 1 0 0 1-1-1V3z'/></svg>") center / 14px no-repeat;
          cursor: pointer;
        }
        .remote-cursor-line { background: rgba(16,185,129,0.06); }
        .remote-cursor-caret::before {
          content: '';
          position: absolute;
          width: 2px;
          height: 100%;
          background: #34d399;
        }
        .remote-cursor-flag {
          position: absolute;
          padding: 1px 6px;
          font-size: 10px;
          font-weight: 600;
          color: #0b1120;
          border-radius: 4px 4px 4px 0;
          white-space: nowrap;
          z-index: 10;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          pointer-events: none;
          line-height: 14px;
          top: -16px;
        }
      `}</style>
      <Editor
        path={path}
        language={languageForPath(path)}
        value={value}
        theme="codesync-dark"
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        onChange={handleMountChange}
        loading={<div className="flex items-center justify-center h-full text-slate-500 text-sm">Loading editor…</div>}
        options={{
          fontSize: 13,
          fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
          fontLigatures: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          tabSize: 2,
          readOnly,
          domReadOnly: readOnly,
          glyphMargin: true,
          lineNumbers: 'on',
          renderLineHighlight: 'line',
          padding: { top: 12, bottom: 12 },
          scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
          automaticLayout: true,
        }}
      />
    </div>
  )
}
