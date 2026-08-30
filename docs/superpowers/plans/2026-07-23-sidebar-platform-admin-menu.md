# Sidebar Platform Admin Menu Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin users get a sidebar menu link to `/platform`; platform sidebar “返回首页” becomes “返回工作台” via `/studio` redirect.

**Architecture:** Reuse `redirectToActiveWorkspace` for `/studio`. Gate the platform link with `session.user.role === "admin"` and existing `showHomeLink` prop (platform shows workbench link; workspace shows admin link).

**Tech Stack:** TanStack Router, Better Auth session (`role`), Tabler icons, existing `SidebarUserSection`.

---

### Task 1: `/studio` redirect route

**Files:**

- Create: `apps/web/src/routes/studio.tsx`

- [ ] **Step 1:** Add route mirroring `agent.tsx` / `studio.resumes.tsx`, destination `/w/${slug}/studio`.

### Task 2: Sidebar user menu

**Files:**

- Modify: `apps/web/src/components/layout/sidebar-user-section.tsx`

- [ ] **Step 1:** Rename home link to「返回工作台」→ `/studio`.
- [ ] **Step 2:** When `!showHomeLink && session.user.role === "admin"`, add「进入管理后台」→ `/platform` (both collapsed and expanded menus).

### Task 3: Verify

- [ ] **Step 1:** Typecheck / lint touched files.
