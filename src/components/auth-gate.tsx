'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Zap, GitBranch, Terminal } from 'lucide-react'
import { apiPost } from '@/lib/api'
import { setStoredUser } from '@/lib/api'
import { useApp } from '@/lib/store'
import { toast } from 'sonner'

const FEATURES = [
  { icon: Users, title: 'Multi-user live editing', desc: 'See cursors and edits in real time.' },
  { icon: GitBranch, title: 'Version history', desc: 'Commit, review, and revert changes.' },
  { icon: Terminal, title: 'Run in the browser', desc: 'Execute HTML, JS, and React instantly.' },
  { icon: Zap, title: 'Share & collaborate', desc: 'Invite teammates with read/write access.' },
]

export function AuthGate() {
  const setUser = useApp((s) => s.setUser)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
    setLoading(true)
    try {
      const user = await apiPost<{ id: string; name: string; email: string; color: string }>(
        '/api/users',
        { name: name.trim(), email: email.trim() }
      )
      setStoredUser(user)
      setUser(user)
      toast.success(`Welcome, ${user.name}!`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-background">
      {/* Left: marketing panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden bg-gradient-to-br from-emerald-950 via-slate-950 to-emerald-900 text-emerald-50">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, #10b981 0, transparent 40%), radial-gradient(circle at 80% 70%, #34d399 0, transparent 40%)' }} />
        <div className="relative">
          <div className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <div className="size-9 rounded-lg bg-emerald-500 grid place-items-center text-emerald-950 font-black">{'</>'}</div>
            CodeSync
          </div>
          <p className="mt-1 text-emerald-300/80 text-sm">Real-time collaborative code editor</p>
        </div>

        <div className="relative space-y-8">
          <h1 className="text-4xl font-bold leading-tight">
            Code together,<br />
            <span className="text-emerald-400">like Google Docs — for code.</span>
          </h1>
          <p className="text-emerald-100/80 max-w-md">
            A mini GitHub Codespaces in your browser. Multi-user live editing, file trees,
            in-browser execution, version history, comments, chat, and shareable links.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 max-w-lg">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-emerald-500/20 bg-emerald-950/40 p-4 backdrop-blur">
                <f.icon className="size-5 text-emerald-400" />
                <div className="mt-2 font-semibold text-sm">{f.title}</div>
                <div className="text-xs text-emerald-200/70 mt-0.5">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-emerald-300/60">
          No password needed — just pick a display name and email to start a session.
        </div>
      </div>

      {/* Right: sign-in */}
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-2 shadow-lg">
          <CardHeader className="space-y-2 text-center">
            <div className="lg:hidden mx-auto size-12 rounded-xl bg-emerald-500 grid place-items-center text-emerald-950 font-black text-xl">{'</>'}</div>
            <CardTitle className="text-2xl">Start collaborating</CardTitle>
            <CardDescription>Enter a name and email to create or resume your session.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Display name</Label>
                <Input
                  id="name"
                  placeholder="Ada Lovelace"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="ada@codesync.dev"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="off"
                />
              </div>
              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" disabled={loading}>
                {loading ? 'Starting session…' : 'Continue →'}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Your identity is stored locally in this browser. No password required.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
