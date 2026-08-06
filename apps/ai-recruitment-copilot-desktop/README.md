# @arc/ai-recruitment-copilot-desktop

Electron desktop app (electron-vite + React + TypeScript) for HR–candidate conversation capture and transcription.

## Stack

- [electron-vite](https://electron-vite.org/)
- React 19 + TypeScript
- TanStack Router (hash history — safe for Electron `file://` + dev)
- TanStack Query (`@arc/shared/query-client` defaults)
- Tailwind CSS v4 (`@tailwindcss/vite`) — theme tokens aligned with web app
- Tabler icons (`@tabler/icons-react`)
- shadcn/coss-style UI subset under `src/renderer/src/components/ui/`
- electron-builder for packaging

## UI components (ported from web)

C-end form basics:

- `button`, `input`, `textarea`, `label`
- `checkbox`, `radio-group`, `switch`, `select`
- `field`, `form`, `separator`, `coss-style`
- `scroll-area` (OverlayScrollbars + `os-theme-app`)

Root shell (`AppShell`) wraps page content in `ScrollArea` so the main viewport
does not show the OS-native scrollbar.

Import with the same alias as web:

```ts
import { Button } from "@/components/ui/button";
```

## Commands

From the monorepo root:

```bash
pnpm --filter @arc/ai-recruitment-copilot-desktop dev
pnpm --filter @arc/ai-recruitment-copilot-desktop typecheck
pnpm --filter @arc/ai-recruitment-copilot-desktop build
pnpm --filter @arc/ai-recruitment-copilot-desktop build:mac
pnpm --filter @arc/ai-recruitment-copilot-desktop build:win
```

From this package:

```bash
pnpm dev
pnpm typecheck
pnpm build
```

## Layout

```
src/
  main/       # Electron main process
  preload/    # contextBridge preload
  renderer/   # React UI
resources/    # app icons / assets
build/        # electron-builder resources
```

## Notes

- Prefer running with `--filter` so `pnpm dev` at the monorepo root does not have to be the only entry for this app.
- Dual-audio capture and STT integration are intentionally not scaffolded yet.
