'use client'

import { useState, useCallback, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Play, Trash2, Terminal as TerminalIcon, Eye, Loader2 } from 'lucide-react'
import type { FileNode } from '@/lib/types'
import { assemble, runJs, type ConsoleLine } from '@/lib/runner'

interface Props {
  files: FileNode[]
  runSignal?: number
}

export function TerminalPanel({ files, runSignal }: Props) {
  const [tab, setTab] = useState('output')
  const [lines, setLines] = useState<ConsoleLine[]>([])
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [running, setRunning] = useState(false)
  const [lastMode, setLastMode] = useState<string>('')

  const run = useCallback(async () => {
    setRunning(true)
    const result = assemble(files)
    setLastMode(result.mode)

    if (result.mode === 'iframe') {
      setPreviewHtml(result.html || '')
      setTab('preview')
      setLines((l) => [{ text: '▶ Preview ready', kind: 'info' }, ...l])
    } else if (result.mode === 'console') {
      setTab('output')
      setLines([{ text: '$ run', kind: 'info' }])
      const out = await runJs(result.jsCode || '', result.language === 'jsx')
      setLines((prev) => [...prev, ...out])
    } else {
      setTab('output')
      setLines([{ text: result.text || '', kind: 'info' }])
    }
    setRunning(false)
  }, [files])

  // respond to external Run trigger (from top bar)
  useEffect(() => {
    if (runSignal && runSignal > 0) {
      // defer to avoid synchronous setState during effect
      const id = setTimeout(() => run(), 0)
      return () => clearTimeout(id)
    }
  }, [runSignal])

  function clearOutput() {
    setLines([])
    setPreviewHtml('')
  }

  return (
    <div className="h-full flex flex-col bg-[#0b1120] border-t border-slate-800">
      <div className="flex items-center gap-2 px-2 h-9 border-b border-slate-800 bg-[#0f172a]">
        <Tabs value={tab} onValueChange={setTab} className="flex-1">
          <TabsList className="h-7 bg-transparent p-0 gap-1">
            <TabsTrigger value="output" className="h-7 px-2 text-xs gap-1 data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400 rounded-md">
              <TerminalIcon className="size-3.5" /> Output
            </TabsTrigger>
            <TabsTrigger value="preview" className="h-7 px-2 text-xs gap-1 data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400 rounded-md">
              <Eye className="size-3.5" /> Preview
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1">
          {lastMode && (
            <span className="text-[10px] text-slate-500 mr-1 hidden sm:inline">{lastMode} mode</span>
          )}
          <Button
            size="sm"
            className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1"
            onClick={run}
            disabled={running}
          >
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            Run
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-slate-400 hover:text-slate-200 px-2" onClick={clearOutput} title="Clear">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'output' && (
          <div className="h-full overflow-y-auto p-3 font-mono text-[13px] leading-relaxed custom-scroll">
            {lines.length === 0 ? (
              <div className="text-slate-600 text-xs italic">
                Ready. Press <span className="text-emerald-500">Run</span> to execute your code in the browser.
              </div>
            ) : (
              lines.map((l, i) => (
                <div
                  key={i}
                  className={
                    l.kind === 'error'
                      ? 'text-red-400'
                      : l.kind === 'warn'
                      ? 'text-amber-400'
                      : l.kind === 'info'
                      ? 'text-slate-500'
                      : 'text-slate-200'
                  }
                >
                  <span className="text-slate-600 select-none mr-2">{l.kind === 'error' ? '✖' : l.kind === 'warn' ? '⚠' : l.kind === 'info' ? '›' : '›'}</span>
                  <span className="whitespace-pre-wrap">{l.text}</span>
                </div>
              ))
            )}
          </div>
        )}
        {tab === 'preview' && (
          <div className="h-full bg-white">
            {previewHtml ? (
              <iframe title="preview" srcDoc={previewHtml} className="w-full h-full border-0" sandbox="allow-scripts allow-modals allow-forms allow-popups" />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2 bg-slate-900 text-center px-4">
                <Eye className="size-8 text-slate-600" />
                <p className="text-sm">No preview yet.</p>
                <p className="text-xs text-slate-600">Add an <code className="text-emerald-400">index.html</code> file and press Run.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
