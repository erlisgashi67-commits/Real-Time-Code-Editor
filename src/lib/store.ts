'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ClientUser } from '@/lib/types'

interface AppState {
  user: ClientUser | null
  view: 'dashboard' | 'editor'
  currentProjectId: string | null
  pendingShareToken: string | null
  setUser: (u: ClientUser | null) => void
  openProject: (id: string) => void
  goDashboard: () => void
  setPendingShare: (token: string | null) => void
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      view: 'dashboard',
      currentProjectId: null,
      pendingShareToken: null,
      setUser: (u) => set({ user: u }),
      openProject: (id) => set({ view: 'editor', currentProjectId: id }),
      goDashboard: () => set({ view: 'dashboard', currentProjectId: null }),
      setPendingShare: (token) => set({ pendingShareToken: token }),
    }),
    {
      name: 'codesync-store',
      partialize: (s) => ({ user: s.user }),
    }
  )
)
