'use client'

import { useEffect, useRef, useState } from 'react'
import { useApp } from '@/lib/store'
import {
  setStoredUser,
  fetchMe,
  apiPost,
  registerSessionExpiredHandler,
  armSessionHandler,
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

  // Register a global 401 handler: if ANY API call returns 401 MID-SESSION,
  // re-verify the session via fetchMe before clearing the user. This avoids
  // false logouts from transient 401s during HMR / dev-server recompiles.
  useEffect(() => {
    registerSessionExpiredHandler(async () => {
      disarmSessionHandler()
      const me = await fetchMe()
      if (me) {
        // Session is actually still valid — the 401 was transient. Re-arm.
        setStoredUser(me)
        setUser(me)
        armSessionHandler()
      } else if (me === null) {
        // Confirmed: session is gone. Clear and show auth gate.
        setStoredUser(null)
        setUser(null)
      }
      // If me === undefined (network error), keep current user — don't logout.
      setReady(true)
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
        // Valid session confirmed.
        setStoredUser(me)
        setUser(me)
        armSessionHandler()
      } else if (me === null) {
        // Definitively no session — clear any stale cache.
        setStoredUser(null)
        setUser(null)
      }
      // If `me === undefined`, the check FAILED (network error / HMR / server
      // compiling). DON'T clear the user — this prevents transient dev-server
      // blips from logging the user out.
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
