'use client'

import { useEffect, useRef, useState } from 'react'
import { useApp } from '@/lib/store'
import {
  setStoredUser,
  fetchMe,
  apiPost,
  registerSessionExpiredHandler,
  armSessionHandler,
  disarmSessionHandler,
  isSessionExpiredError,
} from '@/lib/api'
import { AuthGate } from '@/components/auth-gate'
import { Dashboard } from '@/components/dashboard'
import { Workspace } from '@/components/editor/workspace'
import { toast } from 'sonner'

export default function Home() {
  const { user, view, currentProjectId, setUser, openProject, goDashboard } = useApp()
  const [ready, setReady] = useState(false)
  const claimingRef = useRef(false)
  const didInitRef = useRef(false)

  // Register a global 401 handler: if ANY API call returns 401 MID-SESSION
  // (expired cookie, server restart, etc.), clear the stale user and show a
  // single clear toast. This is only "armed" AFTER fetchMe() confirms a valid
  // session, so it never fires during initial load / sign-in.
  useEffect(() => {
    registerSessionExpiredHandler(() => {
      disarmSessionHandler()
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
  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true
    let cancelled = false
    fetchMe().then((me) => {
      if (cancelled) return
      if (me) {
        setStoredUser(me)
        setUser(me)
        // Arm the session-expired handler ONLY after we've confirmed a valid
        // session. Before this, 401s are a normal "not signed in" state.
        armSessionHandler()
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

  // When the user signs in via the AuthGate, arm the handler.
  useEffect(() => {
    if (user && ready) {
      armSessionHandler()
    }
  }, [user, ready])

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
        if (!isSessionExpiredError(err)) {
          toast.error(err instanceof Error ? err.message : 'Invalid or expired share link')
        }
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
