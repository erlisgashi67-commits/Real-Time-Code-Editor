# Worklog — CodeSync (Real-time Collaborative Code Editor)

Project: A mini GitHub Codespaces + Google Docs for code.
Single-page Next.js app (only `/` route visible) + Socket.io mini-service (port 3003) for real-time collaboration.

---
Task ID: 0
Agent: orchestrator
Task: Project bootstrap & planning

Work Log:
- Explored existing Next.js 16 + shadcn/ui scaffold, Prisma+SQLite, dev server on :3000
- Installed: socket.io, socket.io-client, @monaco-editor/react, monaco-editor, nanoid
- Decided architecture: Next.js app (port 3000) + socket.io real-time service (port 3003)
- Decided visual identity: app "CodeSync", emerald accent (no blue/indigo), light dashboard + dark IDE workspace

Stage Summary:
- Stack locked: Next.js 16 App Router, TypeScript, Tailwind 4, shadcn/ui, Prisma/SQLite, Socket.io, Monaco
- Single visible route `/` with client-side view switching (dashboard <-> IDE)
- Next: Prisma schema, socket service, API routes, frontend

---
Task ID: 3
Agent: collab-service-builder
Task: Build standalone Bun + TypeScript Socket.io real-time collaboration mini-service at `mini-services/collab-service/` (port 3003, path `/`)

Work Log:
- Read worklog + project context; confirmed socket.io v4.8.3 already installed in parent project
- Created `mini-services/collab-service/` as an independent Bun project with its own `package.json` (name: "collab-service", type: module, `dev` script = `bun --hot index.ts` for auto-restart on file change) and `tsconfig.json` (target ESNext, module ESNext, moduleResolution bundler, types bun-types)
- Implemented `index.ts` with the full required protocol:
  - In-memory `presence: Map<projectId, Map<socketId, {id,name,color}>>` and `socketMeta: Map<socketId, {user, projectIds:Set}>` for cleanup
  - `join-project`: joins socket.io room `project:<projectId>`, stores user, broadcasts `presence-update`, emits system `chat-message` "{name} joined the session"
  - `leave-project`: removes user, broadcasts `presence-update` + system leave chat
  - `file-edit`: broadcasts `{filePath, content, authorName, timestamp}` to room except sender
  - `cursor`: broadcasts `{userId, name, color, filePath, position, selection}` to room except sender (uses stored presence color/name)
  - `chat-message`: generates id + ISO timestamp, broadcasts `{id, authorName, content, createdAt, system:false}` to WHOLE room including sender
  - `comment-added`: broadcasts `{comment}` to whole room including sender
  - `comment-resolved`: broadcasts `{commentId}` to whole room including sender
  - `typing`: broadcasts `{userId, name, color, filePath, isTyping}` to room except sender
  - `disconnect`: removes socket from ALL joined projects, broadcasts `presence-update` + system leave chat for each affected room; tracks per-socket projectIds for reliable cleanup
- Health check: GET `/health` returns `{"ok":true,"service":"collab-service"}`. Implemented by capturing engine.io's `request` listener after `new Server(httpServer)`, removing it, and wrapping it in a unified handler that short-circuits `/health` before delegating to engine.io (avoids double-response since socket.io path is `/`)
- Hard-coded port 3003 (no env PORT), `path: '/'`, CORS `origin: '*'` + methods GET/POST, pingTimeout 60s / pingInterval 25s
- Graceful shutdown on SIGTERM/SIGINT via `io.close()` + `httpServer.close()`
- Started service in background with `bun run dev` (→ `bun --hot index.ts`); used double-fork pattern `( ( nohup ... & ) & )` so the process is reparented to init (PPID 1) and survives bash session teardown — matching how the Next.js dev server (PID 1128) is hosted
- Verified end-to-end with a socket.io-client smoke test (two clients Alice/Bob): join presence + system chats, multi-user presence-update (2 users), chat-message relay (incl sender), cursor/typing relay (except sender, with stored color/name), comment-added relay, file-edit relay, and disconnect cleanup (presence drop + "left the session" system chat). All checks passed.
- Confirmed engine.io polling handshake at `/?EIO=4&transport=polling` returns a valid sid (socket.io transport fully functional alongside the health endpoint)

Files created:
- `mini-services/collab-service/package.json`
- `mini-services/collab-service/tsconfig.json`
- `mini-services/collab-service/index.ts`

Health check response (from `curl http://localhost:3003/health`):
`{"ok":true,"service":"collab-service"}`

Running process (background, survived across bash sessions):
- PID 1936 `bun run dev` (PPID 1, orphaned to init)
- PID 1938 `bun --hot index.ts` (child of 1936) — actively listening on port 3003

Stage Summary:
- collab-service is live on :3003 with the exact event protocol the frontend will need
- Frontend (Next.js) should connect with `io("/?XTransformPort=3003")` per the Caddy gateway convention
- All 7 client→server events + 7 server→client events implemented and verified
- Health endpoint works for liveness probes; engine.io transport intact
- Next agent can now build the Next.js collaboration UI (presence panel, Monaco editor with cursor/typing, chat & comments sidebars) against this service

---
Task ID: 4
Agent: orchestrator
Task: lib utilities + API routes

Work Log:
- Created src/lib/session.ts (resolveUser/requireUser by x-codesync-user header, idempotent by email)
- Created src/lib/types.ts, src/lib/templates.ts (6 templates: blank, web-page, node-cli, react-snippet, markdown-docs, python-script)
- Created src/lib/runner.ts (client-side: inline HTML/CSS/JS into srcdoc, sandboxed iframe JS execution with console capture, simulated python)
- Created src/lib/access.ts (getAccess/permission helpers + re-exports)
- API routes (all verified via curl): users, projects (list/create), projects/[id] (GET/PATCH/DELETE), files (list/create), files/[fid] (GET/PUT/DELETE), commit (git-style snapshot), versions (list/restore), comments (CRUD+resolve), chat (list/post), share (CRUD), share/[token] (resolve+claim), collaborators (CRUD)

Stage Summary:
- Full REST backend working; seeded test project for user Ada (ada@codesync.dev)
- Permissions model: owner=ADMIN, collaborators READ/WRITE/ADMIN, public projects readable
- Share links grant access via claim (upserts collaborator with token permission)
- Next: frontend dashboard + IDE workspace + real-time wiring

---
Task ID: 5-7
Agent: orchestrator
Task: Frontend dashboard + IDE workspace + real-time wiring

Work Log:
- Built src/lib/store.ts (zustand + persist for user identity), src/lib/api.ts (fetch wrapper auto-attaching x-codesync-user header)
- AuthGate: split-screen sign-in (name+email), creates/resumes session via /api/users
- Dashboard: project grid (owned + collaborated), template-picker create dialog (6 templates), user avatar, sign-out, sticky footer (min-h-screen flex-col + mt-auto)
- IDE workspace (src/components/editor/*):
  - use-collab.ts: socket.io hook (presence, file-edit relay, cursors, chat, comments, typing) via io('/?XTransformPort=3003')
  - file-tree.tsx: nested folder tree with create/delete, per-ext icons, comment counts
  - code-editor.tsx: Monaco wrapper, dark 'codesync-dark' theme, remote cursor decorators + name-flag content widgets, comment gutter glyphs, gutter-click → comment, controlled value with remote-apply echo suppression
  - side-panel.tsx: Chat / Comments / History / People tabs
  - terminal-panel.tsx: Output (sandboxed JS console capture) + Preview (srcdoc iframe) tabs, Run from top bar
  - share-dialog.tsx: share links (READ/WRITE), collaborators CRUD, public toggle
  - workspace.tsx: orchestrates files/tabs/contents, debounced auto-save + file-edit broadcast, commit dialog, version restore, comment dialog
- page.tsx: hydrates user, claims ?share=TOKEN, routes dashboard<->editor

Stage Summary:
- Fixed critical live-edit echo bug: applying remote edit via executeEdits triggered onChange → marked dirty + echoed back, blocking syncs. Fix: skip onChange when new value === controlled prop (remote-apply echo).
- Lint clean (satisfied React Compiler rules: refs, set-state-in-effect, static-components, immutability)

---
Task ID: 8
Agent: orchestrator
Task: End-to-end verification with Agent Browser

Work Log:
- Verified via gateway (port 81) so socket.io XTransformPort forwarding works
- ✓ Auth: sign in as Ada (seeded starter project auto-created for new users)
- ✓ Dashboard: project list + create-from-template (web-page, node-cli verified)
- ✓ IDE: file tree, tabs, Monaco editor, terminal, side panel all render
- ✓ Run in browser: Preview iframe inlines HTML+CSS+JS (rendered "Live Preview" + "Click me" button); Console mode executed index.js → Fibonacci "0, 1, 1, 2, 3, 5, 8, 13, 21, 34", "Sum of first 10: 88"
- ✓ Real-time presence: 2 sessions (Ada + Bob) both see each other online (ONLINE NOW: 2), LIVE indicator
- ✓ Real-time chat: Bob's message delivered to Ada instantly
- ✓ Real-time code editing: Bob's edit synced to Ada's editor model (repeated edits, no dirty-block), auto-saved to DB
- ✓ Version history: initial commit + new commit (hash 5nX4W6Ab, "1 file(s) snapshotted"), Restore buttons
- ✓ Git commit flow: dialog → message → snapshot → history update
- ✓ Share links: created link (WRITE), Bob claimed via ?share=TOKEN → granted WRITE → opened project
- ✓ Collaborators: Bob auto-added as WRITE collaborator via share claim, visible in People tab
- ✓ Comments: gutter click → dialog → submit → live relay to Ada (received in Comments tab)
- ✓ Responsive: mobile (390px) single-column dashboard; desktop (1440px) 3-column grid
- ✓ Sticky footer: desktop footer_bottom=900=viewport_h (sticks on short content), pushed down on mobile overflow

Stage Summary:
- ALL features browser-verified end-to-end through the gateway
- Two services running: Next.js :3000 (served via gateway :81) + collab-service :3003
- Lint clean, no runtime errors
