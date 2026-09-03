# Meeting Buddy (AI Hiring Copilot Desktop)

Electron desktop app for Meeting Buddy (`@app/desktop`) — HR–candidate conversation capture and transcription (electron-vite + React + TypeScript).

## 职责与边界

本应用负责桌面端独有能力：已认证的招聘工作区访问、系统/麦克风音频采集、本地录音与会话恢复、实时转写，以及 Electron 窗口和系统集成。它可以调用 `apps/server` 的 API，也可以复用 `@app/shared`、`@app/db-schema` 和 `@app/meeting-live-transcript` 的契约，但不应复制服务端业务规则。

- Electron 主进程能力放在 `src/main/`，包括本地数据库、录音落盘、IPC 和窗口生命周期。
- 仅向渲染进程暴露的安全桥接放在 `src/preload/`；新增 Node/Electron 权限时必须从这里显式收窄接口。
- React 页面、组件和客户端状态放在 `src/renderer/`。
- 桌面本地数据库 schema 或迁移放在 `src/main/database/` 与 `drizzle-local/`，不得混入服务端 PostgreSQL schema。
- 跨运行时的数据契约优先修改对应 `packages/*`，不要在 IPC 两侧维护两份相似类型。

## 修改与新增指南

| 需求                             | 修改位置                                                               |
| -------------------------------- | ---------------------------------------------------------------------- |
| 新增窗口、托盘、快捷键或系统权限 | `src/main/`，必要时补 `src/preload/` 的最小桥接                        |
| 新增录音、恢复或实时转写能力     | `src/main/meeting-capture/`；共享协议放 `@app/meeting-live-transcript` |
| 新增桌面页面或交互               | `src/renderer/src/components/features/` 和路由模块                     |
| 新增 IPC                         | 主进程注册、preload 暴露和渲染端调用三处同步，并补边界测试             |
| 修改服务端业务行为               | 改 `apps/server` 或所属共享处理包，不在桌面端复制实现                  |

修改后至少运行 `bun run --filter @app/desktop typecheck` 和相关测试；涉及打包资源、主进程或 preload 时再运行 `bun run --filter @app/desktop build`。

## Stack

- [electron-vite](https://electron-vite.org/)
- React 19 + TypeScript
- TanStack Router (hash history — safe for Electron `file://` + dev)
- TanStack Query (`@app/shared/query-client` defaults)
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
bun run --filter @app/desktop dev
bun run --filter @app/desktop typecheck
bun run --filter @app/desktop build
bun run --filter @app/desktop build:mac
bun run --filter @app/desktop build:win
```

From this package:

```bash
bun run dev
bun run typecheck
bun run build
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

- Prefer running with `--filter` so `bun run dev` at the monorepo root does not have to be the only entry for this app.
- Dual-audio capture and STT integration are intentionally not scaffolded yet.
