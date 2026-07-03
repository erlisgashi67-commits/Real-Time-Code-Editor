'use client'

import { useEffect, useState, type FormEvent, type ComponentType, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, FileCode, Globe, Terminal, Atom, FileText, Users, Clock, LogOut, Sparkles } from 'lucide-react'
import { apiGet, apiPost, signOut as doSignOut, isSessionExpiredError } from '@/lib/api'
import { useApp } from '@/lib/store'
import { TEMPLATES } from '@/lib/templates'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

interface ProjectSummary {
  id: string
  name: string
  description: string
  template: string
  language: string
  ownerName: string
  isOwner: boolean
  role: string
  fileCount: number
  collaboratorCount: number
  createdAt: string
  updatedAt: string
}

const TEMPLATE_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  FileCode, Globe, Terminal, Atom, FileText,
}

export function Dashboard() {
  const { user, openProject, setUser } = useApp()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiGet<ProjectSummary[]>('/api/projects')
      setProjects(data)
    } catch (err) {
      // Session-expiry is handled globally (clears user + shows a single toast).
      if (!isSessionExpiredError(err)) {
        toast.error(err instanceof Error ? err.message : 'Failed to load projects')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function signOut() {
    await doSignOut()
    setUser(null)
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-emerald-500 grid place-items-center text-emerald-950 font-black text-sm">{'</>'}</div>
            <span className="font-bold text-lg">CodeSync</span>
            <Badge variant="secondary" className="ml-2 hidden sm:inline-flex">collaborative</Badge>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <Avatar className="size-8 border" style={{ backgroundColor: user?.color || '#10b981' }}>
                <AvatarFallback className="text-white text-xs font-semibold">
                  {user?.name?.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="leading-tight">
                <div className="font-medium">{user?.name}</div>
                <div className="text-xs text-muted-foreground">{user?.email}</div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
              <LogOut className="size-4 mr-1" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-6xl w-full px-4 sm:px-6 py-8 sm:py-12">
        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Your workspace</h1>
          <p className="text-muted-foreground mt-1">
            Create a project from a template, or open one to start collaborating in real time.
          </p>
        </div>

        {/* New project CTA */}
        <div className="mb-10">
          <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(id) => openProject(id)}>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="size-4 mr-1" /> New project
            </Button>
          </CreateProjectDialog>
        </div>

        {/* Projects */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Projects {projects.length > 0 && `(${projects.length})`}
          </h2>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-44 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center">
                <Sparkles className="size-10 mx-auto text-emerald-500 mb-3" />
                <h3 className="font-semibold text-lg">No projects yet</h3>
                <p className="text-muted-foreground text-sm mt-1 mb-4 max-w-sm mx-auto">
                  Spin up your first project from a template and invite a friend to edit with you live.
                </p>
                <CreateProjectDialog onCreated={(id) => openProject(id)}>
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Plus className="size-4 mr-1" /> Create your first project
                  </Button>
                </CreateProjectDialog>
              </CardContent>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((p) => {
                const Icon = TEMPLATE_ICONS[p.template === 'blank' ? 'FileCode' : p.template] || FileCode
                return (
                  <Card
                    key={p.id}
                    className="group cursor-pointer hover:border-emerald-400 hover:shadow-md transition-all relative overflow-hidden"
                    onClick={() => openProject(p.id)}
                  >
                    <div className="absolute top-0 right-0 h-20 w-20 -mr-8 -mt-8 rounded-full bg-emerald-500/5 group-hover:bg-emerald-500/10 transition-colors" />
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="size-10 rounded-lg bg-emerald-50 grid place-items-center text-emerald-600">
                          <Icon className="size-5" />
                        </div>
                        {p.isOwner ? (
                          <Badge variant="outline" className="text-emerald-700 border-emerald-300">Owner</Badge>
                        ) : (
                          <Badge variant="secondary">{p.role}</Badge>
                        )}
                      </div>
                      <CardTitle className="text-base mt-3 group-hover:text-emerald-700 transition-colors">{p.name}</CardTitle>
                      <CardDescription className="line-clamp-2 min-h-[2.5rem]">{p.description}</CardDescription>
                    </CardHeader>
                    <CardFooter className="pt-0 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileCode className="size-3" /> {p.fileCount} files
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="size-3" /> {p.collaboratorCount}
                      </span>
                      <span className="flex items-center gap-1 ml-auto">
                        <Clock className="size-3" /> {formatDistanceToNow(new Date(p.updatedAt), { addSuffix: true })}
                      </span>
                    </CardFooter>
                  </Card>
                )
              })}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t mt-auto">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 text-xs text-muted-foreground flex items-center justify-between">
          <span>CodeSync — real-time collaborative code editor</span>
          <span>Built with Next.js · Socket.io · Monaco</span>
        </div>
      </footer>
    </div>
  )
}

function CreateProjectDialog({
  children,
  open,
  onOpenChange,
  onCreated,
}: {
  /** Optional trigger element. When provided, wraps it in a DialogTrigger.
   *  When omitted, the dialog is controlled via `open`/`onOpenChange`. */
  children?: ReactNode
  open?: boolean
  onOpenChange?: (v: boolean) => void
  onCreated: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [templateId, setTemplateId] = useState('blank')
  const [loading, setLoading] = useState(false)
  const [internalOpen, setInternalOpen] = useState(false)

  const isOpen = open !== undefined ? open : internalOpen
  const setOpen = onOpenChange || setInternalOpen

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      const res = await apiPost<{ id: string }>('/api/projects', {
        name: name.trim(),
        description: description.trim(),
        templateId,
      })
      toast.success('Project created')
      setOpen(false)
      setName('')
      setDescription('')
      setTemplateId('blank')
      onCreated(res.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create a new project</DialogTitle>
          <DialogDescription>Pick a template to start from. You can add and edit files after.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="p-name">Project name</Label>
              <Input id="p-name" placeholder="My awesome app" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-desc">Description (optional)</Label>
              <Input id="p-desc" placeholder="What are you building?" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Template</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TEMPLATES.map((t) => {
                const Icon = TEMPLATE_ICONS[t.icon] || FileCode
                const selected = templateId === t.id
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => setTemplateId(t.id)}
                    className={`text-left rounded-lg border p-3 transition-all ${
                      selected
                        ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                        : 'border-border hover:border-emerald-300 hover:bg-muted/50'
                    }`}
                  >
                    <Icon className={`size-5 ${selected ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                    <div className="mt-1.5 font-medium text-sm">{t.name}</div>
                    <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.description}</div>
                  </button>
                )
              })}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={loading}>
              {loading ? 'Creating…' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
