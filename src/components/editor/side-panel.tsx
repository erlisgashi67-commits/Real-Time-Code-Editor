'use client'

import { useState, useRef, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, MessageSquare, GitBranch, Users, History, Check, RotateCcw, Circle, FileCode } from 'lucide-react'
import type { ChatRecord, CommentRecord, VersionRecord, PresenceUser } from '@/lib/types'
import { formatDistanceToNow, format } from 'date-fns'
import { cn } from '@/lib/utils'

interface Props {
  user: { id: string; name: string; color: string }
  messages: ChatRecord[]
  comments: CommentRecord[]
  versions: VersionRecord[]
  collaborators: { id: string; userName: string; permission: string }[]
  online: PresenceUser[]
  activeFilePath: string | null
  activeLine: number | null
  readOnly: boolean
  onSendChat: (content: string) => void
  onResolveComment: (id: string) => void
  onJumpToComment: (filePath: string, line: number) => void
  onRestoreVersion: (id: string) => void
}

export function SidePanel(props: Props) {
  const [tab, setTab] = useState('chat')
  const unreadComments = props.comments.filter((c) => !c.resolved).length

  return (
    <Tabs value={tab} onValueChange={setTab} className="h-full flex flex-col bg-[#0f172a]">
      <TabsList className="grid grid-cols-4 h-9 rounded-none border-b bg-transparent p-0">
        <TabsTrigger value="chat" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs gap-1">
          <MessageSquare className="size-3.5" /> Chat
        </TabsTrigger>
        <TabsTrigger value="comments" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs gap-1">
          <MessageSquare className="size-3.5" /> Comments
          {unreadComments > 0 && <span className="ml-0.5 text-[10px] px-1 rounded-full bg-amber-500 text-amber-950">{unreadComments}</span>}
        </TabsTrigger>
        <TabsTrigger value="history" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs gap-1">
          <History className="size-3.5" /> History
        </TabsTrigger>
        <TabsTrigger value="people" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs gap-1">
          <Users className="size-3.5" /> People
        </TabsTrigger>
      </TabsList>

      <TabsContent value="chat" className="flex-1 mt-0 overflow-hidden">
        <ChatTab {...props} />
      </TabsContent>
      <TabsContent value="comments" className="flex-1 mt-0 overflow-hidden">
        <CommentsTab {...props} />
      </TabsContent>
      <TabsContent value="history" className="flex-1 mt-0 overflow-hidden">
        <HistoryTab {...props} />
      </TabsContent>
      <TabsContent value="people" className="flex-1 mt-0 overflow-hidden">
        <PeopleTab {...props} />
      </TabsContent>
    </Tabs>
  )
}

function ChatTab({ user, messages, onSendChat }: Props) {
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  function send() {
    const t = text.trim()
    if (!t) return
    onSendChat(t)
    setText('')
  }

  return (
    <div className="h-full flex flex-col">
      <ScrollArea className="flex-1" ref={scrollRef as any}>
        <div className="p-3 space-y-3 max-h-full">
          {messages.length === 0 && (
            <div className="text-center text-slate-500 text-xs py-8">
              No messages yet. Say hello to your collaborators!
            </div>
          )}
          {messages.map((m) => {
            if (m.system) {
              return (
                <div key={m.id} className="text-center">
                  <span className="text-[11px] text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded-full">{m.content}</span>
                </div>
              )
            }
            const mine = m.authorName === user.name
            return (
              <div key={m.id} className={cn('flex gap-2', mine && 'flex-row-reverse')}>
                <Avatar className="size-7 shrink-0 mt-0.5" style={{ backgroundColor: user.color }}>
                  <AvatarFallback className="text-[10px] text-white font-semibold">
                    {m.authorName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className={cn('max-w-[75%]', mine && 'text-right')}>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-0.5">
                    <span className="font-medium text-slate-300">{mine ? 'You' : m.authorName}</span>
                    <span>{format(new Date(m.createdAt), 'HH:mm')}</span>
                  </div>
                  <div className={cn(
                    'inline-block px-3 py-1.5 rounded-2xl text-sm text-left break-words',
                    mine ? 'bg-emerald-600 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-100 rounded-tl-sm'
                  )}>
                    {m.content}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>
      <div className="border-t border-slate-800 p-2 flex gap-2 bg-[#0b1120]">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Type a message…"
          className="h-9 bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500 text-sm"
        />
        <Button size="icon" className="size-9 bg-emerald-600 hover:bg-emerald-700 shrink-0" onClick={send}>
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function CommentsTab({ comments, onResolveComment, onJumpToComment, activeFilePath }: Props) {
  const open = comments.filter((c) => !c.resolved)
  const resolved = comments.filter((c) => c.resolved)
  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-2">
        {open.length === 0 && resolved.length === 0 && (
          <div className="text-center text-slate-500 text-xs py-8">
            No comments yet. Click the gutter next to a line to comment on it.
          </div>
        )}
        {open.map((c) => (
          <CommentCard key={c.id} c={c} onResolve={onResolveComment} onJump={onJumpToComment} active={c.filePath === activeFilePath} />
        ))}
        {resolved.length > 0 && (
          <div className="pt-2">
            <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-1.5">Resolved</div>
            {resolved.map((c) => (
              <CommentCard key={c.id} c={c} onResolve={onResolveComment} onJump={onJumpToComment} active={c.filePath === activeFilePath} faded />
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  )
}

function CommentCard({ c, onResolve, onJump, active, faded }: { c: CommentRecord; onResolve: (id: string) => void; onJump: (f: string, l: number) => void; active: boolean; faded?: boolean }) {
  return (
    <div className={cn('rounded-lg border border-slate-800 bg-slate-900/60 p-2.5 text-sm', faded && 'opacity-60', active && 'border-emerald-500/50')}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-slate-400 flex items-center gap-1">
          <FileCode className="size-3" /> {c.filePath}:{c.lineNumber}
        </span>
        <button className="text-[11px] text-slate-500 hover:text-emerald-400" onClick={() => onJump(c.filePath, c.lineNumber)}>jump →</button>
      </div>
      <p className="text-slate-200 text-[13px] leading-snug">{c.content}</p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] text-slate-500">by {c.authorName} · {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}</span>
        {!faded && (
          <Button size="sm" variant="ghost" className="h-6 text-[11px] text-slate-400 hover:text-emerald-400 px-2" onClick={() => onResolve(c.id)}>
            <Check className="size-3 mr-1" /> Resolve
          </Button>
        )}
      </div>
    </div>
  )
}

function HistoryTab({ versions, onRestoreVersion, readOnly }: Props) {
  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-2">
        {versions.length === 0 && (
          <div className="text-center text-slate-500 text-xs py-8">
            No commits yet. Hit <strong>Commit</strong> to save a version.
          </div>
        )}
        {versions.map((v, i) => (
          <div key={v.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
            <div className="flex items-start gap-2">
              <div className="mt-0.5">
                {i === 0 ? <Circle className="size-3 fill-emerald-500 text-emerald-500" /> : <GitBranch className="size-3.5 text-slate-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-[11px] text-emerald-400 font-mono">{v.hash}</code>
                  <span className="text-[11px] text-slate-500">{formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}</span>
                </div>
                <p className="text-sm text-slate-200 mt-0.5">{v.message}</p>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {v.authorName} · <span className="inline-flex items-center gap-1"><FileCode className="size-3" />{v.filePath}</span>
                </div>
                {!readOnly && (
                  <Button size="sm" variant="ghost" className="h-6 mt-1.5 text-[11px] text-slate-400 hover:text-amber-400 px-2" onClick={() => onRestoreVersion(v.id)}>
                    <RotateCcw className="size-3 mr-1" /> Restore
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

function PeopleTab({ collaborators, online, user }: Props) {
  const onlineNames = new Set(online.map((o) => o.name))
  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-3">
        <div>
          <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Circle className="size-2 fill-emerald-500 text-emerald-500" /> Online now ({online.length})
          </div>
          <div className="space-y-1.5">
            {online.length === 0 && <div className="text-xs text-slate-500">No one online</div>}
            {online.map((o) => (
              <div key={o.id} className="flex items-center gap-2">
                <Avatar className="size-7" style={{ backgroundColor: o.color }}>
                  <AvatarFallback className="text-[10px] text-white font-semibold">{o.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="text-sm text-slate-200">{o.name}{o.id === user.id && <span className="text-slate-500 text-xs"> (you)</span>}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="pt-2 border-t border-slate-800">
          <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Collaborators ({collaborators.length})</div>
          <div className="space-y-1.5">
            {collaborators.length === 0 && <div className="text-xs text-slate-500">No collaborators. Share the project to invite.</div>}
            {collaborators.map((c) => (
              <div key={c.id} className="flex items-center justify-between">
                <span className="text-sm text-slate-200 flex items-center gap-2">
                  {c.userName}
                  {onlineNames.has(c.userName) && <Circle className="size-2 fill-emerald-500 text-emerald-500" />}
                </span>
                <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400">{c.permission}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  )
}
