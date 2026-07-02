'use client'

import { create } from 'zustand'

interface AppState {
  user: { id: string; name: string; email: string; color: string } | null
  view: 'dashboard' | 'editor'
  currentProjectId: string | null
  setUser: (u: AppState['user']) => void
  openProject: (id: string) => void
  goDashboard: () => void
}

/**
 * App-level UI state. The `user` field is NOT persisted to localStorage — the
 * signed httpOnly session cookie is the single source of truth for auth.
 * On reload, `page.tsx` calls `fetchMe()` to rehydrate `user` from the cookie,
 * showing a brief loading screen until the session is confirmed. This avoids
 * stale-cache races where a cached user in localStorage survives after the
 * cookie has expired.
 */
export const useApp = create<AppState>()((set) => ({
  user: null,
  view: 'dashboard',
  currentProjectId: null,
  setUser: (u) => set({ user: u }),
  openProject: (id) => set({ view: 'editor', currentProjectId: id }),
  goDashboard: () => set({ view: 'dashboard', currentProjectId: null }),
}))
