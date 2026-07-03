'use client'

import { useCallback, useEffect, useRef, useState, type ReactElement, type FormEvent, type ComponentType } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Markdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sparkles,
  X,
  Send,
  Loader2,
  FileCode,
  Bug,
  Lightbulb,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { apiPost } from '@/lib/api'
import { cn } from '@/lib/utils'

export interface AIAssistantProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Project the assistant is operating on (used to build the API URL). */
  projectId: string
  /** The currently open file (path + content) — sent as context to the AI. */
  activeFile: { path: string; content: string } | null
  /** All file paths in the project — sent as a file-list context to the AI. */
  allFiles: { path: string }[]
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface QuickAction {
  label: string
  icon: ComponentType<{ className?: string }>
  prompt: string
}

const QUICK_ACTIONS: readonly QuickAction[] = [
  {
    label: 'Explain this file',
    icon: FileCode,
    prompt:
      'Explain what this file does, step by step, in plain English. Cover the main responsibilities and any non-obvious logic.',
  },
  {
    label: 'Find bugs',
    icon: Bug,
    prompt:
      'Review this file for bugs, edge cases, and potential issues. List each problem with a brief explanation and a suggested fix.',
  },
  {
    label: 'Suggest improvements',
    icon: Lightbulb,
    prompt:
      'Suggest concrete improvements to this code — readability, performance, and correctness. Be specific and prioritise the highest-impact changes.',
  },
  {
    label: 'Refactor',
    icon: RefreshCw,
    prompt:
      'Refactor this file for clarity and maintainability. Show the full refactored code in a fenced block and explain the key changes you made.',
  },
] as const

let _msgIdCounter = 0
function nextId(): string {
  _msgIdCounter += 1
  return `m-${Date.now()}-${_msgIdCounter}`
}

export function AIAssistant({
  open,
  onOpenChange,
  projectId,
  activeFile,
  allFiles,
}: AIAssistantProps): ReactElement {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Auto-scroll to the latest message whenever messages or loading change.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading])

  // Focus the input when the panel opens.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 250)
      return () => clearTimeout(t)
    }
    return undefined
  }, [open])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || loading) return

      const userMsg: ChatMessage = { id: nextId(), role: 'user', content: trimmed }
      setMessages((prev) => [...prev, userMsg])
      setInput('')
      setErrorMsg(null)
      setLoading(true)

      try {
        const res = await apiPost<{ reply: string }>(`/api/projects/${projectId}/ai`, {
          message: trimmed,
          activeFile: activeFile ?? undefined,
          allFiles: allFiles.length > 0 ? allFiles : undefined,
        })
        const reply = res.reply ?? ''
        const aiMsg: ChatMessage = { id: nextId(), role: 'assistant', content: reply }
        setMessages((prev) => [...prev, aiMsg])
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI request failed'
        setErrorMsg(msg)
      } finally {
        setLoading(false)
      }
    },
    [projectId, activeFile, allFiles, loading]
  )

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    void sendMessage(input)
  }

  const handleQuickAction = (action: QuickAction) => {
    if (!activeFile) {
      // No file open — still send the prompt, but inform the user inline.
      void sendMessage(`${action.prompt}\n\n(Note: no file is currently open.)`)
      return
    }
    void sendMessage(action.prompt)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="ai-assistant"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className={cn(
            'fixed bottom-4 right-4 z-50 flex flex-col',
            'w-[min(92vw,380px)] max-h-[60vh]',
            'rounded-xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/50',
            'text-slate-100'
          )}
          role="dialog"
          aria-label="AI Assistant"
          aria-modal="false"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
                <Sparkles className="size-4" />
              </div>
              <h2 className="text-sm font-semibold tracking-tight text-slate-100">AI Assistant</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              onClick={() => onOpenChange(false)}
              aria-label="Close AI assistant"
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-1.5 border-b border-slate-800 px-3 py-2.5">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => handleQuickAction(action)}
                disabled={loading}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border border-slate-700/70 bg-slate-800/40 px-2 py-1 text-[11px] font-medium text-slate-300',
                  'transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300',
                  'disabled:cursor-not-allowed disabled:opacity-50'
                )}
              >
                <action.icon className="size-3" />
                {action.label}
              </button>
            ))}
          </div>

          {/* Message list */}
          <ScrollArea className="flex-1 min-h-0 px-3 py-3">
            <div className="flex flex-col gap-3">
              {messages.length === 0 && !loading && (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <div className="flex size-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                    <Sparkles className="size-5" />
                  </div>
                  <p className="text-xs text-slate-400">
                    Ask me to explain, debug, or refactor your code.
                  </p>
                  {activeFile && (
                    <p className="text-[11px] text-slate-500">
                      Context: <span className="text-slate-400">{activeFile.path}</span>
                    </p>
                  )}
                </div>
              )}

              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}

              {loading && (
                <div className="flex items-start gap-2">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-slate-800 text-emerald-400">
                    <Loader2 className="size-3.5 animate-spin" />
                  </div>
                  <div className="rounded-2xl rounded-bl-sm bg-slate-800/70 px-3 py-2 text-xs text-slate-300">
                    AI is thinking…
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium">Something went wrong</p>
                    <p className="mt-0.5 text-red-300/80">{errorMsg}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg(null)
                      const last = messages.findLast((m) => m.role === 'user')
                      if (last) void sendMessage(last.content)
                    }}
                    className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-red-200 hover:bg-red-500/20"
                  >
                    Retry
                  </button>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-slate-800 p-3"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={activeFile ? `Ask about ${activeFile.path}…` : 'Ask the AI…'}
              disabled={loading}
              maxLength={4000}
              className={cn(
                'flex-1 rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100',
                'placeholder:text-slate-500',
                'focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/30',
                'disabled:cursor-not-allowed disabled:opacity-60'
              )}
            />
            <Button
              type="submit"
              size="icon"
              disabled={loading || !input.trim()}
              className="size-8 shrink-0 bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
              aria-label="Send message"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function MessageBubble({ message }: { message: ChatMessage }): ReactElement {
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex items-start gap-2', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold uppercase',
          isUser
            ? 'bg-emerald-500/15 text-emerald-400'
            : 'bg-slate-800 text-slate-400'
        )}
        aria-hidden
      >
        {isUser ? 'You' : <Sparkles className="size-3.5 text-emerald-400" />}
      </div>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-relaxed',
          isUser
            ? 'rounded-br-sm bg-emerald-500 text-emerald-950'
            : 'rounded-bl-sm bg-slate-800/70 text-slate-100'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none break-words [&_code]:rounded [&_code]:bg-slate-950/70 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px] [&_code]:text-emerald-300 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-slate-700 [&_pre]:bg-slate-950/80 [&_pre]:p-2.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[11px] [&_pre_code]:text-slate-200 [&_a]:text-emerald-400 [&_a]:underline [&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_h1]:mt-2 [&_h1]:mb-1 [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-1 [&_h3]:text-xs [&_h3]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:border-slate-600 [&_blockquote]:pl-2 [&_blockquote]:text-slate-400">
            <Markdown>{message.content}</Markdown>
          </div>
        )}
      </div>
    </div>
  )
}
