'use client'

import { useEffect, useRef, useState } from 'react'
import { useApp } from '@/lib/store'
import { setStoredUser, fetchMe, apiPost, registerSessionExpiredHandler } from '@/lib/api'
import { AuthGate } from '@/components/auth-gate'
import { Dashboard } from '@/components/dashboard'
import { Workspace } from '@/components/editor/workspace'
import { toast } from 'sonner'

export default function Home() {
  const { user, view, currentProjectId, setUser, openProject, goDashboard } = useApp()
  const [ready, setReady] = useState(false)
  const claimingRef = useRef(false)
  const didInitRef = useRef(false)

  // Register a global 401 handler: if ANY API call returns 401 mid-session
  // (expired cookie, server restart, etc.), clear the stale user and show a
  // single clear toast instead of N cryptic "Unauthorized" errors.
  useEffect(() => {
    registerSessionExpiredHandler(() => {
      setStoredUser(null)
      setUser(null)
      setReady(true)
      toast.error('Your session has expired. Please sign in again.')
    })
    return () => {
      registerSessionExpiredHandler(null)
    }
  }, [setUser])

  // Rehydrate the session from the signed httpOnly cookie — exactly ONCE.
  //
  // We deliberately do NOT hydrate `user` from the localStorage cache before
  // this resolves. The cookie is the single source of truth; the cache is only
  // a write-through mirror for offline / instant-display purposes. Showing a
  // brief loading screen (while !ready) avoids both:
  //   - the auth-gate flash, and
  //   - the 401 race where the Dashboard mounts with a stale cache + no cookie.
  //
  // A `didInitRef` guard ensures this runs once, not on every `user` change
  // (which previously caused an infinite fetchMe → setUser → re-render loop).
  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true
    let cancelled = false
    fetchMe().then((me) => {
      if (cancelled) return
      if (me) {
        setStoredUser(me)
        setUser(me)
      } else {
        setStoredUser(null)
        setUser(null)
      }
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [setUser])

  // handle ?share=TOKEN — claim access once signed in
  useEffect(() => {
    if (!ready || !user) return
    const params = new URLSearchParams(window.location.search)
    const token = params.get('share')
    if (!token || claimingRef.current) return
    claimingRef.current = true
    apiPost<{ projectId: string; permission: string }>(`/api/share/${token}`)
      .then((res) => {
        toast.success(`You now have ${res.permission} access`)
        openProject(res.projectId)
        const url = new URL(window.location.href)
        url.searchParams.delete('share')
        window.history.replaceState({}, '', url.toString())
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Invalid or expired share link')
      })
      .finally(() => {
        claimingRef.current = false
      })
  }, [ready, user, openProject])

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="size-8 rounded-lg bg-emerald-500 grid place-items-center text-emerald-950 font-black animate-pulse">{'</>'}</div>
          <span className="text-sm">Loading workspace…</span>
        </div>
      </div>
    )
  }

  return (
    <>
      {!user ? (
        <AuthGate />
      ) : view === 'editor' && currentProjectId ? (
        <Workspace projectId={currentProjectId} onBack={goDashboard} />
      ) : (
        <Dashboard />
      )}
    </>
  )
}
