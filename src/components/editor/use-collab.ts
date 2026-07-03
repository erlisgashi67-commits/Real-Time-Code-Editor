'use client'

import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { ClientUser, PresenceUser } from '@/lib/types'

export interface RemoteCursor {
  userId: string
  name: string
  color: string
  filePath: string
  position: { lineNumber: number; column: number }
  selection: { startLineNumber: number; endLineNumber: number } | null
  /** Client-side timestamp (ms) of the last cursor update — used to expire
   *  stale cursors so disconnected users' markers don't linger. */
  receivedAt?: number
}

export interface CollabHandlers {
  onFileEdit?: (d: { filePath: string; content: string; authorName: string; timestamp: string }) => void
  onCursor?: (c: RemoteCursor) => void
  onChat?: (m: { id: string; authorName: string; content: string; createdAt: string; system: boolean }) => void
  onComment?: (d: { comment: unknown }) => void
  onCommentResolved?: (d: { commentId: string }) => void
  onTyping?: (d: { userId: string; name: string; color: string; filePath: string; isTyping: boolean }) => void
}

export function useCollab(projectId: string | null, user: ClientUser | null, handlers: CollabHandlers) {
  const [online, setOnline] = useState<PresenceUser[]>([])
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const handlersRef = useRef(handlers)
  // keep latest handlers available to socket listeners without re-subscribing
  useEffect(() => {
    handlersRef.current = handlers
  })

  // Destructure the primitive identity fields so the socket effect only
  // re-subscribes when the actual user identity changes (not on every object
  // re-creation, e.g. after /api/auth/me revalidation).
  const userId = user?.id
  const userName = user?.name
  const userColor = user?.color

  useEffect(() => {
    if (!projectId || !userId || !userName || !userColor) return
    let cancelled = false
    let socket: ReturnType<typeof io> | null = null

    // Fetch a short-lived signed token from the server (requires a valid
    // session cookie). The collab service verifies this token in the socket.io
    // handshake — without it, the connection is rejected. This prevents
    // unauthenticated users from joining project rooms or impersonating others.
    fetch('/api/collab/token', { method: 'POST', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { token?: string } | null) => {
        if (cancelled || !data?.token) return
        socket = io('/?XTransformPort=3003', {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 8,
          reconnectionDelay: 1200,
          auth: { token: data.token }, // verified by the collab service
        })
        socketRef.current = socket

        const onConnect = () => {
          setConnected(true)
          socket!.emit('join-project', {
            projectId,
            user: { id: userId, name: userName, color: userColor },
          })
        }
        socket.on('connect', onConnect)
        socket.on('disconnect', () => setConnected(false))
        socket.on('connect_error', () => setConnected(false))
        socket.on('presence-update', (d: { users: PresenceUser[] }) => setOnline(d.users))
        socket.on('file-edit', (d: Parameters<NonNullable<CollabHandlers['onFileEdit']>>[0]) => handlersRef.current.onFileEdit?.(d))
        socket.on('cursor', (c: RemoteCursor) => handlersRef.current.onCursor?.(c))
        socket.on('chat-message', (m: Parameters<NonNullable<CollabHandlers['onChat']>>[0]) => handlersRef.current.onChat?.(m))
        socket.on('comment-added', (d: Parameters<NonNullable<CollabHandlers['onComment']>>[0]) => handlersRef.current.onComment?.(d))
        socket.on('comment-resolved', (d: Parameters<NonNullable<CollabHandlers['onCommentResolved']>>[0]) => handlersRef.current.onCommentResolved?.(d))
        socket.on('typing', (d: Parameters<NonNullable<CollabHandlers['onTyping']>>[0]) => handlersRef.current.onTyping?.(d))
      })
      .catch(() => {
        // Token fetch failed (network error / not authenticated) — don't connect.
      })

    return () => {
      cancelled = true
      if (socket) {
        socket.emit('leave-project', { projectId })
        socket.disconnect()
      }
      socketRef.current = null
      setConnected(false)
      setOnline([])
    }
  }, [projectId, userId, userName, userColor])

  return {
    online,
    connected,
    sendEdit: (filePath: string, content: string) =>
      socketRef.current?.emit('file-edit', {
        projectId,
        filePath,
        content,
        authorName: user?.name || 'anonymous',
      }),
    sendCursor: (filePath: string, position: { lineNumber: number; column: number }, selection: { startLineNumber: number; endLineNumber: number } | null) =>
      socketRef.current?.emit('cursor', { projectId, filePath, position, selection }),
    sendChat: (content: string): string => {
      // Client-generated id lets the sender dedupe its optimistic copy against
      // the relayed broadcast (which the server echoes back to the whole room).
      const clientId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      socketRef.current?.emit('chat-message', {
        projectId,
        authorName: user?.name || 'anonymous',
        content,
        clientId,
      })
      return clientId
    },
    sendComment: (comment: unknown) =>
      socketRef.current?.emit('comment-added', { projectId, comment }),
    sendCommentResolved: (commentId: string) =>
      socketRef.current?.emit('comment-resolved', { projectId, commentId }),
    sendTyping: (filePath: string, isTyping: boolean) =>
      socketRef.current?.emit('typing', { projectId, filePath, isTyping }),
  }
}
