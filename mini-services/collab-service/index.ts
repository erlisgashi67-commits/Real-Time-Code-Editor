/**
 * CodeSync — Real-time collaboration mini-service
 *
 * Bun + TypeScript + Socket.io service running on port 3003.
 * Powers: presence, live file edits, cursor/selection, chat relay,
 * comment relay, and typing indicators for the CodeSync editor.
 *
 * Path is "/" (required by Caddy gateway forwarding).
 * Frontend connects with: io("/?XTransformPort=3003")
 *
 * P2 — Collaboration Correctness hardening:
 *   1. Server-side cursor throttling (~20 emits/sec/socket, drop excess).
 *   2. Inactivity sweep (every 30s, force-disconnect sockets idle >90s;
 *      emits system "{name} went inactive and was disconnected" + presence-update).
 *   3. Session migration on join-project: stale (dead) entries for the same
 *      user.id are removed before registering the new socket.
 *   4. Duplicate-tab handling: if the existing socket for the same user.id is
 *      still alive, BOTH are kept (legitimate multi-tab), not deduped.
 *   5. Typing indicator auto-clear: a 3s safety-net timeout emits isTyping:false
 *      if the client stops emitting; cleared on file-edit / next typing event.
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
  /** Monotonic ms timestamp of the last activity from this socket (any relevant event). */
  lastActivity: number
  /** Set true by the inactivity sweep so the disconnect path suppresses the
   *  normal "{name} left the session" chat (we emit the inactive chat instead). */
  inactiveCleanup: boolean
  /** Pending typing-auto-clear timeout handle (null when none scheduled). */
  typingTimeout: ReturnType<typeof setTimeout> | null
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
 * socketMeta: socketId -> { user, projectIds, lastActivity, ... }
 * Used for cleanup on disconnect (we don't trust the client to call leave).
 */
const socketMeta = new Map<string, SocketMeta>()

/**
 * Per-socket last cursor-relay timestamp (ms). Used to throttle cursor floods.
 * Equivalent to a `socket.data.lastCursorRelay` field but kept in a dedicated
 * map per the spec ("simple per-socket timestamp map").
 */
const cursorLastRelayAt = new Map<string, number>()

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

/** Max cursor emits relayed per socket per second; excess is dropped. */
const CURSOR_MAX_PER_SECOND = 20
/** Minimum interval (ms) between relayed cursor emits for a single socket. */
const CURSOR_MIN_INTERVAL_MS = Math.ceil(1000 / CURSOR_MAX_PER_SECOND) // 50ms

/** How often the inactivity sweep runs. */
const INACTIVITY_SWEEP_INTERVAL_MS = 30_000
/** A socket with no activity for this long is force-disconnected. */
const INACTIVITY_TIMEOUT_MS = 90_000

/** Safety-net timeout for stale "typing..." indicators. */
const TYPING_AUTO_CLEAR_MS = 3000

const roomFor = (projectId: string): string => `project:${projectId}`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mark a socket as active right now. */
function touchActivity(meta: SocketMeta): void {
  meta.lastActivity = Date.now()
}

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

/**
 * Remove a socket from a single project room (presence + room membership).
 * Emits presence-update and (unless this is an inactivity cleanup) the
 * "{name} left the session" system chat.
 */
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

  // Notify remaining users of the updated presence list.
  broadcastPresence(io, projectId)

  // During an inactivity cleanup we already emit a dedicated inactive chat,
  // so suppress the generic "left the session" message to avoid duplication.
  if (meta.user && !meta.inactiveCleanup) {
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
  // Built-in engine.io heartbeat. The application-level inactivity sweep
  // (below) is the backstop for zombie connections that pass ping/pong but
  // emit no events.
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
// Inactivity sweep — runs every 30s, force-disconnects sockets idle >90s.
// ---------------------------------------------------------------------------

setInterval(() => {
  const now = Date.now()
  const toCleanup = new Set<string>()

  for (const map of presence.values()) {
    for (const socketId of map.keys()) {
      const meta = socketMeta.get(socketId)
      if (!meta) continue
      if (meta.inactiveCleanup) continue // already mid-cleanup
      if (now - meta.lastActivity > INACTIVITY_TIMEOUT_MS) {
        toCleanup.add(socketId)
      }
    }
  }

  if (toCleanup.size === 0) return

  for (const socketId of toCleanup) {
    const meta = socketMeta.get(socketId)
    if (!meta || meta.inactiveCleanup) continue

    const name = meta.user?.name ?? socketId
    const idleSec = Math.round((now - meta.lastActivity) / 1000)
    const sock = io.sockets.sockets.get(socketId)

    if (!sock) {
      // Socket already gone (transport closed) but presence entry lingered.
      console.log(
        `[collab] inactivity cleanup: ${name} (${socketId}) already disconnected; removing stale presence`
      )
      for (const pid of Array.from(meta.projectIds)) {
        const m = presence.get(pid)
        if (m) {
          m.delete(socketId)
          if (m.size === 0) presence.delete(pid)
        }
        broadcastPresence(io, pid)
        emitSystemChat(io, pid, `${name} went inactive and was disconnected`)
      }
      meta.projectIds.clear()
      if (meta.typingTimeout) {
        clearTimeout(meta.typingTimeout)
        meta.typingTimeout = null
      }
      cursorLastRelayAt.delete(socketId)
      socketMeta.delete(socketId)
      continue
    }

    console.log(
      `[collab] inactivity cleanup: ${name} (${socketId}) idle ${idleSec}s — force-disconnecting`
    )
    // Mark so the disconnect path suppresses the generic "left" chat
    // (we emit the dedicated inactive chat instead, below).
    meta.inactiveCleanup = true

    // Emit the inactive system chat for every project this socket was in.
    // The disconnect handler (fired by sock.disconnect) will then broadcast
    // presence-update for each of those rooms.
    for (const pid of meta.projectIds) {
      emitSystemChat(io, pid, `${name} went inactive and was disconnected`)
    }

    // Force-close the underlying connection. This fires 'disconnect' which
    // runs removeFromProject (-> presence-update) for each joined project.
    sock.disconnect(true)
  }
}, INACTIVITY_SWEEP_INTERVAL_MS).unref()

// ---------------------------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------------------------

io.on('connection', (socket: Socket) => {
  console.log(`[collab] socket connected: ${socket.id}`)

  // Initialize per-socket metadata
  socketMeta.set(socket.id, {
    user: null,
    projectIds: new Set(),
    lastActivity: Date.now(),
    inactiveCleanup: false,
    typingTimeout: null,
  })

  // -------------------------------------------------------------------------
  // join-project  (with session migration + duplicate-tab handling)
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
          touchActivity(meta)
        }

        if (!presence.has(projectId)) presence.set(projectId, new Map())
        const map = presence.get(projectId)!

        // -------------------------------------------------------------------
        // Reconnect / duplicate-tab handling:
        // Look for an existing entry for the same user.id under a DIFFERENT
        // socket.id. If that old socket is dead -> session migration (remove
        // stale entry). If it's alive -> legitimate second tab, keep both.
        // -------------------------------------------------------------------
        const staleSocketIds: string[] = []
        let aliveDuplicate = false
        for (const [existingSid, existingUser] of map) {
          if (existingSid === socket.id) continue
          if (existingUser.id !== user.id) continue
          if (io.sockets.sockets.has(existingSid)) {
            // Old socket still alive — two tabs, keep both (no dedupe).
            aliveDuplicate = true
          } else {
            // Old socket is dead — stale entry from a prior session.
            staleSocketIds.push(existingSid)
          }
        }

        for (const staleSid of staleSocketIds) {
          console.log(
            `[collab] session migration for ${user.name} (${user.id}): stale socket ${staleSid} -> ${socket.id}`
          )
          map.delete(staleSid)
          const oldMeta = socketMeta.get(staleSid)
          if (oldMeta) {
            oldMeta.projectIds.delete(projectId)
            if (oldMeta.projectIds.size === 0) {
              if (oldMeta.typingTimeout) {
                clearTimeout(oldMeta.typingTimeout)
              }
              cursorLastRelayAt.delete(staleSid)
              socketMeta.delete(staleSid)
            }
          }
        }
        if (aliveDuplicate) {
          console.log(
            `[collab] ${user.name} (${user.id}) joined ${room} from an additional tab (existing session alive — kept both)`
          )
        }

        // Add this socket to the presence map
        map.set(socket.id, {
          id: user.id,
          name: user.name,
          color: user.color,
        })

        // Join the socket.io room
        void socket.join(room)
        console.log(`[collab] ${user.name} (${user.id}) joined ${room}`)

        // Notify everyone in the room of the new (possibly migrated) presence
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
      touchActivity(meta)
      console.log(
        `[collab] ${meta.user?.name ?? socket.id} leaving ${roomFor(payload.projectId)}`
      )
      removeFromProject(io, socket, payload.projectId)
    } catch (err) {
      console.error('[collab] leave-project error:', err)
    }
  })

  // -------------------------------------------------------------------------
  // file-edit  (also clears any pending typing auto-clear)
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
        touchActivity(meta)

        // User is actively editing — cancel the typing-auto-clear safety net
        // so we don't erroneously fire isTyping:false mid-edit.
        if (meta.typingTimeout) {
          clearTimeout(meta.typingTimeout)
          meta.typingTimeout = null
        }

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
  // cursor  (server-side throttle: ~20/sec/socket, drop excess)
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
        touchActivity(meta)

        // Throttle: enforce a minimum interval between relayed cursor emits.
        // Drops floods above ~CURSOR_MAX_PER_SECOND per socket; the latest
        // allowed emit within each window carries the most recent position.
        const now = Date.now()
        const last = cursorLastRelayAt.get(socket.id) ?? 0
        if (last && now - last < CURSOR_MIN_INTERVAL_MS) {
          // Excess — drop. (Client re-emits every ~80ms, so the next allowed
          // emit will carry a fresh position within tens of milliseconds.)
          return
        }
        cursorLastRelayAt.set(socket.id, now)

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
    (payload: { projectId: string; authorName: string; content: string; clientId?: string }) => {
      try {
        if (!payload || !payload.projectId || typeof payload.content !== 'string') return
        const meta = socketMeta.get(socket.id)
        if (!meta || !meta.projectIds.has(payload.projectId)) return
        touchActivity(meta)

        // Use the client-supplied clientId when present so the sender can
        // dedupe against its optimistic local copy (prevents double messages).
        const message = {
          id: typeof payload.clientId === 'string' && payload.clientId.length > 0 ? payload.clientId : generateChatId(),
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
        touchActivity(meta)

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
        touchActivity(meta)

        io.to(roomFor(payload.projectId)).emit('comment-resolved', {
          commentId: payload.commentId,
        })
      } catch (err) {
        console.error('[collab] comment-resolved error:', err)
      }
    }
  )

  // -------------------------------------------------------------------------
  // typing  (relayed to room EXCEPT sender, with 3s auto-clear safety net)
  // -------------------------------------------------------------------------
  socket.on(
    'typing',
    (payload: { projectId: string; filePath: string; isTyping: boolean }) => {
      try {
        if (!payload || !payload.projectId || !payload.filePath) return
        const meta = socketMeta.get(socket.id)
        if (!meta || !meta.user || !meta.projectIds.has(payload.projectId)) return
        touchActivity(meta)

        // Clear any existing auto-clear timeout (whether turning on or off).
        if (meta.typingTimeout) {
          clearTimeout(meta.typingTimeout)
          meta.typingTimeout = null
        }

        // Relay the typing event to everyone else in the room.
        socket.to(roomFor(payload.projectId)).emit('typing', {
          userId: meta.user.id,
          name: meta.user.name,
          color: meta.user.color,
          filePath: payload.filePath,
          isTyping: payload.isTyping,
        })

        // Safety net: if the client turns typing ON and then never sends an
        // explicit isTyping:false (e.g. they tab away, crash, or just stop),
        // auto-emit isTyping:false after TYPING_AUTO_CLEAR_MS so indicators
        // don't get stuck. Cleared on file-edit or the next typing event.
        if (payload.isTyping) {
          const projectId = payload.projectId
          const filePath = payload.filePath
          const socketId = socket.id
          meta.typingTimeout = setTimeout(() => {
            const m = socketMeta.get(socketId)
            if (!m || !m.user) return
            m.typingTimeout = null
            socket.to(roomFor(projectId)).emit('typing', {
              userId: m.user.id,
              name: m.user.name,
              color: m.user.color,
              filePath,
              isTyping: false,
            })
          }, TYPING_AUTO_CLEAR_MS)
        }
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
      cursorLastRelayAt.delete(socket.id)
      return
    }

    // Cancel any pending typing auto-clear so it can't fire post-disconnect.
    if (meta.typingTimeout) {
      clearTimeout(meta.typingTimeout)
      meta.typingTimeout = null
    }

    const name = meta.user?.name ?? socket.id
    const wasInactiveCleanup = meta.inactiveCleanup
    console.log(
      `[collab] ${name} disconnected (${reason})${wasInactiveCleanup ? ' [inactivity cleanup]' : ''}`
    )

    // Snapshot projectIds because removeFromProject mutates the Set
    const projectIds = Array.from(meta.projectIds)
    for (const projectId of projectIds) {
      removeFromProject(io, socket, projectId)
    }

    cursorLastRelayAt.delete(socket.id)
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
  console.log(
    `[collab-service] cursor throttle: ${CURSOR_MAX_PER_SECOND}/s per socket (min interval ${CURSOR_MIN_INTERVAL_MS}ms)`
  )
  console.log(
    `[collab-service] inactivity sweep: every ${INACTIVITY_SWEEP_INTERVAL_MS / 1000}s, timeout ${INACTIVITY_TIMEOUT_MS / 1000}s`
  )
  console.log(
    `[collab-service] typing auto-clear: ${TYPING_AUTO_CLEAR_MS}ms safety net`
  )
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
