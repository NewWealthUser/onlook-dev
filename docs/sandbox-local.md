# Local Sandbox Orchestration

This document captures the end-to-end flow for starting, restarting, and inspecting a local sandbox instance on macOS. It focuses on the Phase 4 pipeline where the browser UI coordinates with the Next.js API layer and the `@onlook/code-provider` runtime to manage a Bun-powered dev server without relying on Docker.

## Start Flow

1. **Session manager bootstraps** – When a project view loads, the client-side [`SessionManager`](apps/web/client/src/components/store/editor/sandbox/session.ts) immediately invokes `start` with the branch sandbox ID. The method guards against duplicate connections and requests a fresh session by calling `api.sandbox.start.mutate({ sandboxId })`.
2. **Router selects provider** – The API endpoint [`sandboxRouter.start`](apps/web/client/src/server/api/routers/project/sandbox.ts) inspects the sandbox ID. IDs that begin with `local-` are treated as macOS sandboxes and resolved to a `LocalProvider`. The router sanitizes the ID, builds a project directory beneath `env.ONLOOK_PROJECTS_DIR`, and instantiates the provider with that path plus a preferred port.
3. **Local provider spins up Bun** – Inside [`LocalProvider`](packages/code-provider/src/providers/local/index.ts) the runtime ensures the project folder exists, finds an open port (auto-incrementing when conflicts occur), and spawns `bun run dev` with `PORT` injected. Stdout/stderr are streamed into a bounded log buffer (200 entries by default) and exposed through task and subscription APIs.
4. **Client hydrates provider** – Back in the browser, the session manager caches the initial `LocalCreateSessionOutput`, then creates a `LocalProvider` client with a `getSession` hook that reuses the cached payload for the first handshake and falls back to `api.sandbox.start` for later refreshes. Terminal sessions are initialized once the provider resolves.

## Restart Flow

- The **Restart Sandbox** button (`apps/web/client/src/app/project/[id]/_components/bottom-bar/restart-sandbox-button.tsx`) defers to `sandbox.session.restartDevServer()`, which routes through `LocalProvider.getTask('dev').restart()`. The runtime gracefully sends `SIGTERM`, escalates to `SIGKILL` after a five second grace period, and respawns the Bun process on the previously negotiated port. Preview frames refresh after a short delay to avoid transient 502s.

## Port Management

- Ports are requested via `preferredPort` (defaults to 3000). [`findAvailablePort`](packages/code-provider/src/providers/local/index.ts) probes sequentially until a free port is found, ensuring the sandbox starts even when other services occupy the default. The resolved port is cached in the session payload so later restarts remain on the same address. API helpers sanitize sandbox IDs and root directories to prevent path traversal.

## Logs Pipeline

- The local runtime pushes stdout/stderr lines into an in-memory ring buffer while annotating each entry with a log level (`info`, `warn`, `error`) and timestamp.
- The UI exposes these diagnostics through the new [`SandboxLogsPanel`](apps/web/client/src/app/project/[id]/_components/bottom-bar/sandbox-logs-panel.tsx). Users can toggle the panel from the terminal toolbar, filter by level, and watch streaming updates via `SessionManager.subscribeToDevServerLogs`. Remote sandboxes fall back to the existing task output (`task.open()`), so the panel still renders when the provider is CodeSandbox.

## Cleanup

- `sandboxRouter.delete` and `sandboxRouter.hibernate` reuse the same provider detection and call `LocalProvider.stopProject()` to tear down the Bun process when a branch is deleted or hibernated. `LocalRuntimeRegistry` removes the runtime entry so subsequent starts create a fresh instance.
