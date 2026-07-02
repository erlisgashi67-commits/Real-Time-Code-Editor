'use client'

import { useEffect, useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Copy, Check, Link2, Plus, Trash2, Users, Globe, Lock } from 'lucide-react'
import { apiGet, apiPost, apiDel } from '@/lib/api'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface ShareLink { id: string; token: string; permission: string; createdAt: string; expiresAt: string | null }
interface Collaborator { id: string; userName: string; permission: string }

export function ShareDialog({
  open,
  onOpenChange,
  projectId,
  isOwner,
  isPublic,
  onPublicChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  projectId: string
  isOwner: boolean
  isPublic: boolean
  onPublicChange: (v: boolean) => void
}) {
  const [links, setLinks] = useState<ShareLink[]>([])
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [linkPerm, setLinkPerm] = useState('WRITE')
  const [collabName, setCollabName] = useState('')
  const [collabEmail, setCollabEmail] = useState('')
  const [collabPerm, setCollabPerm] = useState('WRITE')
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [l, c] = await Promise.all([
        apiGet<ShareLink[]>(`/api/projects/${projectId}/share`).catch(() => []),
        apiGet<Collaborator[]>(`/api/projects/${projectId}/collaborators`),
      ])
      setLinks(l)
      setCollaborators(c)
    } catch {
      // owner-only endpoints may 403 for non-owners
    }
  }, [projectId])

  useEffect(() => {
    // fetch share links + collaborators whenever the dialog opens
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate fetch-on-open
    if (open) load()
  }, [open, load])

  async function createLink() {
    try {
      const link = await apiPost<ShareLink>(`/api/projects/${projectId}/share`, { permission: linkPerm })
      setLinks((l) => [link, ...l])
      toast.success('Share link created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create link')
    }
  }

  async function deleteLink(id: string) {
    try {
      await apiDel(`/api/projects/${projectId}/share?id=${id}`)
      setLinks((l) => l.filter((x) => x.id !== id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete link')
    }
  }

  async function addCollab() {
    if (!collabName.trim()) return
    try {
      const c = await apiPost<Collaborator>(`/api/projects/${projectId}/collaborators`, {
        userName: collabName.trim(),
        email: collabEmail.trim() || undefined,
        permission: collabPerm,
      })
      setCollaborators((list) => [...list.filter((x) => x.userName !== c.userName), c])
      setCollabName('')
      setCollabEmail('')
      toast.success(`${c.userName} added as ${c.permission}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add collaborator')
    }
  }

  async function removeCollab(id: string) {
    try {
      await apiDel(`/api/projects/${projectId}/collaborators?id=${id}`)
      setCollaborators((list) => list.filter((x) => x.id !== id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove')
    }
  }

  function shareUrl(token: string) {
    return `${window.location.origin}/?share=${token}`
  }

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      toast.error('Copy failed')
    }
  }

  async function togglePublic(v: boolean) {
    try {
      await apiPut(`/api/projects/${projectId}`, { isPublic: v })
      onPublicChange(v)
      toast.success(v ? 'Project is now public (read-only)' : 'Project is private')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share project</DialogTitle>
          <DialogDescription>Invite collaborators or generate a shareable link.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          {/* Visibility */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2">
              {isPublic ? <Globe className="size-4 text-emerald-500" /> : <Lock className="size-4 text-slate-400" />}
              <div>
                <div className="text-sm font-medium">{isPublic ? 'Public' : 'Private'}</div>
                <div className="text-xs text-muted-foreground">{isPublic ? 'Anyone can read' : 'Only collaborators'}</div>
              </div>
            </div>
            {isOwner && <Switch checked={isPublic} onCheckedChange={togglePublic} />}
          </div>

          {/* Share links */}
          {isOwner && (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Share links</Label>
              <div className="flex gap-2">
                <Select value={linkPerm} onValueChange={setLinkPerm}>
                  <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="READ">Can view</SelectItem>
                    <SelectItem value="WRITE">Can edit</SelectItem>
                  </SelectContent>
                </Select>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={createLink}>
                  <Link2 className="size-4 mr-1" /> Create link
                </Button>
              </div>
              <div className="space-y-1.5">
                {links.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 rounded-md border p-2 bg-muted/30">
                    <code className="text-xs flex-1 truncate font-mono">{shareUrl(l.token)}</code>
                    <Badge variant="outline" className="text-[10px]">{l.permission}</Badge>
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => copy(shareUrl(l.token), l.id)}>
                      {copied === l.id ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => deleteLink(l.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                {links.length === 0 && <p className="text-xs text-muted-foreground">No links yet.</p>}
              </div>
            </div>
          )}

          {/* Collaborators */}
          {isOwner && (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Users className="size-3" /> Collaborators
              </Label>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input placeholder="Name" value={collabName} onChange={(e) => setCollabName(e.target.value)} className="h-9" />
                <Input placeholder="Email (optional)" value={collabEmail} onChange={(e) => setCollabEmail(e.target.value)} className="h-9" />
                <Button size="sm" variant="outline" className="h-9" onClick={addCollab}><Plus className="size-4" /></Button>
              </div>
              <Select value={collabPerm} onValueChange={setCollabPerm}>
                <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="READ">Can view</SelectItem>
                  <SelectItem value="WRITE">Can edit</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
              <div className="space-y-1.5">
                {collaborators.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-md border p-2 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{c.userName}</span>
                      <Badge variant="outline" className="text-[10px]">{c.permission}</Badge>
                    </div>
                    <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => removeCollab(c.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                {collaborators.length === 0 && <p className="text-xs text-muted-foreground">No collaborators yet.</p>}
              </div>
            </div>
          )}

          {!isOwner && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Only the project owner can manage sharing. Ask the owner for a share link.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
