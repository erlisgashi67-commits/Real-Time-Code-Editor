/**
 * CodeSync — Real-time collaboration mini-service
 *
 * Bun + TypeScript + Socket.io service running on port 3003.
 * Powers: presence, live file edits, cursor/selection, chat relay,
 * comment relay, and typing indicators for the CodeSync editor.
 *
 * Path is "/" (required by Caddy gateway forwarding).
 * Frontend connects with: io("/?XTransformPort=3003")
 */

import { createServer, IncomingMessage, ServerResponse } from 'http'
import { Server, Socket } from 'socket.io'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CollabUser {
  id: string
  name: string
  color: string
}

interface CursorPosition {
  lineNumber: number
  column: number
}

interface CursorSelection {
  startLineNumber: number
  endLineNumber: number
}

interface SocketMeta {
  user: CollabUser | null
  projectIds: Set<string>
}

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

/**
 * presence: projectId -> (socketId -> user)
 * Tracks who is currently in each project room.
 */
const presence = new Map<string, Map<string, CollabUser>>()

/**
 * socketMeta: socketId -> { user, projectIds }
 * Used for cleanup on disconnect (we don't trust the client to call leave).
 */
const socketMeta = new Map<string, SocketMeta>()

// Simple monotonic id generator for chat messages
let chatIdCounter = 0
const generateChatId = (): string => {
  chatIdCounter += 1
  return `m_${Date.now().toString(36)}_${chatIdCounter}`
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PORT = 3003 // hard-coded per spec; do NOT use env PORT

const roomFor = (projectId: string): string => `project:${projectId}`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the presence list for a project room. */
function getPresenceList(projectId: string): CollabUser[] {
  const map = presence.get(projectId)
  if (!map) return []
  return Array.from(map.values())
}

/** Broadcast the current presence list for a project to everyone in the room. */
function broadcastPresence(io: Server, projectId: string): void {
  const users = getPresenceList(projectId)
  io.to(roomFor(projectId)).emit('presence-update', { users })
}

/** Emit a system chat message to a project room. */
function emitSystemChat(
  io: Server,
  projectId: string,
  content: string
): void {
  const message = {
    id: generateChatId(),
    authorName: 'System',
    content,
    createdAt: new Date().toISOString(),
    system: true,
  }
  io.to(roomFor(projectId)).emit('chat-message', message)
}

/** Remove a socket from a single project room (presence + room membership). */
function removeFromProject(io: Server, socket: Socket, projectId: string): void {
  const meta = socketMeta.get(socket.id)
  if (!meta) return

  const map = presence.get(projectId)
  if (map) {
    map.delete(socket.id)
    if (map.size === 0) {
      presence.delete(projectId)
    }
  }

  meta.projectIds.delete(projectId)
  socket.leave(roomFor(projectId))

  // Notify remaining users
  broadcastPresence(io, projectId)

  if (meta.user) {
    emitSystemChat(io, projectId, `${meta.user.name} left the session`)
  }
}

// ---------------------------------------------------------------------------
// HTTP server + Socket.io
// ---------------------------------------------------------------------------

const httpServer = createServer()

const io = new Server(httpServer, {
  // DO NOT change the path; Caddy uses it to forward to this port.
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

/**
 * Health check: intercept GET /health BEFORE engine.io handles it.
 *
 * When socket.io attaches to httpServer it adds its own 'request' listener
 * (engine.io). To avoid double-responding on /health, we capture that
 * listener, remove it, and re-install a wrapper that short-circuits /health.
 */
const engineRequestListeners = httpServer.listeners('request').slice()
httpServer.removeAllListeners('request')
httpServer.on('request', (req: IncomingMessage, res: ServerResponse) => {
  const urlPath = (req.url || '').split('?')[0]
  if (req.method === 'GET' && (urlPath === '/health' || urlPath === '/health/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'collab-service' }))
    return
  }
  // Delegate everything else (engine.io polling/websocket upgrade) to socket.io.
  for (const listener of engineRequestListeners) {
    listener.call(httpServer, req, res)
  }
})

// ---------------------------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------------------------

io.on('connection', (socket: Socket) => {
  console.log(`[collab] socket connected: ${socket.id}`)

  // Initialize per-socket metadata
  socketMeta.set(socket.id, { user: null, projectIds: new Set() })

  // -------------------------------------------------------------------------
  // join-project
  // -------------------------------------------------------------------------
  socket.on(
    'join-project',
    (payload: { projectId: string; user: CollabUser }) => {
      try {
        if (!payload || !payload.projectId || !payload.user) {
          socket.emit('error', { message: 'invalid join-project payload' })
          return
        }
        const { projectId, user } = payload
        const room = roomFor(projectId)

        // Track socket metadata
        const meta = socketMeta.get(socket.id)
        if (meta) {
          meta.user = { id: user.id, name: user.name, color: user.color }
          meta.projectIds.add(projectId)
        }

        // Add to presence map
        if (!presence.has(projectId)) presence.set(projectId, new Map())
        presence.get(projectId)!.set(socket.id, { id: user.id, name: user.name, color: user.color })

        // Join the socket.io room
        void socket.join(room)
        console.log(`[collab] ${user.name} (${user.id}) joined ${room}`)

        // Notify everyone in the room of the new presence
        broadcastPresence(io, projectId)

        // System chat: "{name} joined the session"
        emitSystemChat(io, projectId, `${user.name} joined the session`)
      } catch (err) {
        console.error('[collab] join-project error:', err)
      }
    }
  )

  // -------------------------------------------------------------------------
  // leave-project
  // -------------------------------------------------------------------------
  socket.on('leave-project', (payload: { projectId: string }) => {
    try {
      if (!payload || !payload.projectId) return
      const meta = socketMeta.get(socket.id)
      if (!meta || !meta.projectIds.has(payload.projectId)) return
      console.log(
        `[collab] ${meta.user?.name ?? socket.id} leaving ${roomFor(payload.projectId)}`
      )
      removeFromProject(io, socket, payload.projectId)
    } catch (err) {
      console.error('[collab] leave-project error:', err)
    }
  })

  // -------------------------------------------------------------------------
  // file-edit
  // -------------------------------------------------------------------------
  socket.on(
    'file-edit',
    (payload: {
      projectId: string
      filePath: string
      content: string
      authorName: string
    }) => {
      try {
        if (!payload || !payload.projectId || !payload.filePath) return
        const meta = socketMeta.get(socket.id)
        if (!meta || !meta.projectIds.has(payload.projectId)) return

        socket.to(roomFor(payload.projectId)).emit('file-edit', {
          filePath: payload.filePath,
          content: payload.content,
          authorName: payload.authorName,
          timestamp: Date.now(),
        })
      } catch (err) {
        console.error('[collab] file-edit error:', err)
      }
    }
  )

  // -------------------------------------------------------------------------
  // cursor
  // -------------------------------------------------------------------------
  socket.on(
    'cursor',
    (payload: {
      projectId: string
      filePath: string
      position: CursorPosition
      selection: CursorSelection | null
    }) => {
      try {
        if (!payload || !payload.projectId || !payload.filePath) return
        const meta = socketMeta.get(socket.id)
        if (!meta || !meta.user || !meta.projectIds.has(payload.projectId)) return

        socket.to(roomFor(payload.projectId)).emit('cursor', {
          userId: meta.user.id,
          name: meta.user.name,
          color: meta.user.color,
          filePath: payload.filePath,
          position: payload.position,
          selection: payload.selection ?? null,
        })
      } catch (err) {
        console.error('[collab] cursor error:', err)
      }
    }
  )

  // -------------------------------------------------------------------------
  // chat-message  (relayed to WHOLE room including sender)
  // -------------------------------------------------------------------------
  socket.on(
    'chat-message',
    (payload: { projectId: string; authorName: string; content: string }) => {
      try {
        if (!payload || !payload.projectId || typeof payload.content !== 'string') return
        const meta = socketMeta.get(socket.id)
        if (!meta || !meta.projectIds.has(payload.projectId)) return

        const message = {
          id: generateChatId(),
          authorName: payload.authorName,
          content: payload.content,
          createdAt: new Date().toISOString(),
          system: false,
        }
        // Whole room, including sender
        io.to(roomFor(payload.projectId)).emit('chat-message', message)
      } catch (err) {
        console.error('[collab] chat-message error:', err)
      }
    }
  )

  // -------------------------------------------------------------------------
  // comment-added  (relayed to WHOLE room including sender)
  // -------------------------------------------------------------------------
  socket.on(
    'comment-added',
    (payload: { projectId: string; comment: unknown }) => {
      try {
        if (!payload || !payload.projectId) return
        const meta = socketMeta.get(socket.id)
        if (!meta || !meta.projectIds.has(payload.projectId)) return

        io.to(roomFor(payload.projectId)).emit('comment-added', {
          comment: payload.comment,
        })
      } catch (err) {
        console.error('[collab] comment-added error:', err)
      }
    }
  )

  // -------------------------------------------------------------------------
  // comment-resolved  (relayed to WHOLE room including sender)
  // -------------------------------------------------------------------------
  socket.on(
    'comment-resolved',
    (payload: { projectId: string; commentId: string }) => {
      try {
        if (!payload || !payload.projectId || !payload.commentId) return
        const meta = socketMeta.get(socket.id)
        if (!meta || !meta.projectIds.has(payload.projectId)) return

        io.to(roomFor(payload.projectId)).emit('comment-resolved', {
          commentId: payload.commentId,
        })
      } catch (err) {
        console.error('[collab] comment-resolved error:', err)
      }
    }
  )

  // -------------------------------------------------------------------------
  // typing  (relayed to room EXCEPT sender)
  // -------------------------------------------------------------------------
  socket.on(
    'typing',
    (payload: { projectId: string; filePath: string; isTyping: boolean }) => {
      try {
        if (!payload || !payload.projectId || !payload.filePath) return
        const meta = socketMeta.get(socket.id)
        if (!meta || !meta.user || !meta.projectIds.has(payload.projectId)) return

        socket.to(roomFor(payload.projectId)).emit('typing', {
          userId: meta.user.id,
          name: meta.user.name,
          color: meta.user.color,
          filePath: payload.filePath,
          isTyping: payload.isTyping,
        })
      } catch (err) {
        console.error('[collab] typing error:', err)
      }
    }
  )

  // -------------------------------------------------------------------------
  // disconnect — clean up ALL rooms this socket was in
  // -------------------------------------------------------------------------
  socket.on('disconnect', (reason: string) => {
    const meta = socketMeta.get(socket.id)
    if (!meta) {
      console.log(`[collab] socket disconnected: ${socket.id} (${reason})`)
      return
    }

    const name = meta.user?.name ?? socket.id
    console.log(`[collab] ${name} disconnected (${reason})`)

    // Snapshot projectIds because removeFromProject mutates the Set
    const projectIds = Array.from(meta.projectIds)
    for (const projectId of projectIds) {
      removeFromProject(io, socket, projectId)
    }

    socketMeta.delete(socket.id)
  })

  socket.on('error', (err: Error) => {
    console.error(`[collab] socket error (${socket.id}):`, err)
  })
})

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

httpServer.listen(PORT, () => {
  console.log(`[collab-service] listening on port ${PORT}`)
  console.log(`[collab-service] socket.io path: "/"`)
  console.log(`[collab-service] health check: GET http://localhost:${PORT}/health`)
})

// Graceful shutdown
const shutdown = (signal: string) => {
  console.log(`[collab-service] received ${signal}, shutting down...`)
  io.close(() => {
    httpServer.close(() => {
      console.log('[collab-service] closed')
      process.exit(0)
    })
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
