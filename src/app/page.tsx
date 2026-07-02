'use client'

import { useEffect, useRef, useState } from 'react'
import { useApp } from '@/lib/store'
import { getStoredUser, apiPost } from '@/lib/api'
import { AuthGate } from '@/components/auth-gate'
import { Dashboard } from '@/components/dashboard'
import { Workspace } from '@/components/editor/workspace'
import { toast } from 'sonner'

export default function Home() {
  const { user, view, currentProjectId, setUser, openProject, goDashboard } = useApp()
  const [ready, setReady] = useState(false)
  const claimingRef = useRef(false)

  // hydrate user from localStorage on mount
  useEffect(() => {
    const stored = getStoredUser()
    if (stored && !user) setUser(stored)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount flag to avoid SSR hydration mismatch
    setReady(true)
  }, [user, setUser])

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
    return <div className="min-h-screen grid place-items-center bg-background" />
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
