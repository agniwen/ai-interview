# Sidebar 用户菜单：管理后台入口与返回工作台

## Goal

在 sidebar 用户菜单中：

1. 系统角色为 `admin` 时（workspace 侧栏），显示「进入管理后台」，跳转到 platform 首页。
2. Platform 侧栏将「返回首页」改为「返回工作台」，跳转到活跃工作区的 studio 首页。

## Behavior

### Workspace 侧栏（`showHomeLink=false`）

- `session.user.role === "admin"` → 显示「进入管理后台」→ `/platform`（现有 loader 再落到 `/platform/organizations`）。
- 非 admin → 不显示该项。
- Platform 侧栏不显示该项。

### Platform 侧栏（`showHomeLink=true`）

- 「返回工作台」→ `/studio`。
- `/studio` 经 `redirectToActiveWorkspace`：
  - 有活跃工作区 → `/w/{slug}/studio`（再由现有 loader 落到第一个有权限的 studio 页）。
  - 无活跃工作区 → `/select-workspace`。
  - 未登录 → `/login?callbackURL=/studio`。

## Implementation

1. 新增 `apps/web/src/routes/studio.tsx`：作为 `/studio/*` 父路由渲染 `Outlet`；**仅当** `pathname === "/studio"` 时走 `redirectToActiveWorkspace`（避免打断现有 `/studio/resumes` 等 legacy 重定向）。
2. 修改 `sidebar-user-section.tsx`：
   - `showHomeLink`：文案「返回工作台」，链接 `/studio`。
   - `!showHomeLink && role === "admin"`：新增「进入管理后台」，链接 `/platform`。
3. 不改 `select-workspace` 的 `UserMenu`；不改权限中间件（platform loader 仍做 admin 校验）。

## Out of scope

- select-workspace 页顶栏用户菜单
- 角色权限模型变更
