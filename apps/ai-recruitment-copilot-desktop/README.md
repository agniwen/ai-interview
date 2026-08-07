# Meeting Buddy (AI Recruitment Copilot Desktop)

Electron desktop app for Meeting Buddy (`@arc/ai-recruitment-copilot-desktop`) — HR–candidate conversation capture and transcription (electron-vite + React + TypeScript).

## Stack

- [electron-vite](https://electron-vite.org/)
- React 19 + TypeScript
- TanStack Router (hash history — safe for Electron `file://` + dev)
- TanStack Query (`@arc/shared/query-client` defaults)
- Tailwind CSS v4 (`@tailwindcss/vite`) — theme tokens aligned with web app
- Icons via Iconify + Phosphor (`@iconify/react`, `@iconify-json/ph`) — https://icones.js.org/collection/ph
- shadcn/coss-style UI subset under `src/renderer/src/components/ui/`
- electron-builder for packaging

## UI components (ported from web)

C-end form basics:

- `button`, `input`, `textarea`, `label`
- `checkbox`, `radio-group`, `switch`, `select`
- `field`, `form`, `separator`, `coss-style`
- `scroll-area` (OverlayScrollbars + `os-theme-app`)
- `sidebar`, `tooltip`, `skeleton` (desktop-native sidebar chrome)

### Layout (Cursor-style)

No global title bar. Sidebar and content each own a top drag strip:

```
AppShell
  AppSidebarShell              # Magic Portal providers + SidebarProvider
    AppSidebar
      SidebarDragRegion        # top drag (macOS traffic lights sit here)
      portal targets           # header / body / footer
    SidebarInset
      ContentTitleBar          # drag + history nav + settings + window controls
      ScrollArea > <page>      # portal *content* co-located with the page
```

Sidebar menus are not hard-coded in the shell. Pages inject them with the same
Magic Portal pattern as the web studio sidebar (see foxact
[Magic Portal](https://foxact.skk.moe/magic-portal/)):

```ts
// in a page / feature module
import { SidebarBodyPortalContent } from "@/components/layout/app-sidebar/portals";

export function HomeSidebarSlots() {
  return (
    <SidebarBodyPortalContent>
      {/* menu items */}
    </SidebarBodyPortalContent>
  );
}
```

- Home: `components/features/home/home-sidebar-slots.tsx`
- Settings: `components/features/settings/settings-sidebar-slots.tsx`

`⌘B` / `Ctrl+B` toggles the sidebar (icon collapse).

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
