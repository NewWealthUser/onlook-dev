# Onlook Architecture Notes (macOS)

## Sandbox container flow
- Each project branch is wrapped in a `SandboxManager`, `HistoryManager`, and `ErrorManager` that the `BranchManager` wires up when branches load, ensuring every branch has an isolated sandbox session and supporting stores.【F:apps/web/client/src/components/store/editor/branch/manager.ts†L33-L71】
- A `SandboxManager` bootstraps CodeSandbox-backed sessions through its `SessionManager`, handles indexing, and synchronizes files via its `FileSyncManager`, reacting to provider changes and file watcher events to keep the local cache consistent.【F:apps/web/client/src/components/store/editor/sandbox/index.ts†L30-L134】【F:apps/web/client/src/components/store/editor/sandbox/index.ts†L414-L516】
- `SessionManager` connects to the hosted container through `createCodeProviderClient(CodeSandbox, …)`, initializes terminal tasks, and exposes helpers for restarting the dev task or running commands against the sandbox, giving the UI control over the remote runtime.【F:apps/web/client/src/components/store/editor/sandbox/session.ts†L1-L107】

## Iframe preview and sandbox access
- Preview frames register an `<iframe>` per branch, layering Penpal RPC helpers over the DOM element so the editor can drive zoom, reload, and other remote actions while keeping the sandbox isolated via the iframe sandbox attributes.【F:apps/web/client/src/app/project/[id]/_components/canvas/frame/view.tsx†L260-L314】
- When a sandbox is forked or started, preview URLs are formed with `https://<sandboxId>-<port>.csb.app`, aligning the iframe source with the CodeSandbox preview host for the active branch.【F:packages/constants/src/csb.ts†L8-L23】

## Code instrumentation pipeline
- During indexing, JSX files are parsed so the `TemplateNodeManager` can inject preload scripts for root layouts, assign stable OIDs, and cache parsed template node maps, enabling design-surface overlays to map DOM nodes back to source.【F:apps/web/client/src/components/store/editor/template-nodes/index.ts†L1-L120】
- When a tracked file is edited, the sandbox manager reprocesses it through the template node pipeline before persisting to the provider, guaranteeing that the instrumented AST stays aligned with the editor’s node map.【F:apps/web/client/src/components/store/editor/sandbox/index.ts†L271-L302】

## Ports and health checks
- Next.js development defaults to port 3000; local imports reuse that port unless a package script overrides it, so the macOS smoke test targets `http://localhost:3000` for dev URLs.【F:apps/web/client/src/app/projects/import/local/_context/index.tsx†L44-L75】
- CodeSandbox templates also pin port 3000, matching the preview host that the editor opens when spawning new sandboxes.【F:packages/constants/src/csb.ts†L8-L23】
- A lightweight `/api/health` route returns `{ status: 'ok' }`, giving the smoke test a stable readiness probe for the Next dev server.【F:apps/web/client/src/app/api/health/route.ts†L1-L5】
