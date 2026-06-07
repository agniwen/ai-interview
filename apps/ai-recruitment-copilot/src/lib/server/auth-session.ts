import "server-only";

import { auth } from "@arc/ai-recruitment-copilot-backend/lib/server/auth";
import { headers } from "next/headers";
import { cache } from "react";

// React `cache()` memoizes per-request, so nested RSC layouts (e.g.
// `(auth)/layout.tsx` then `studio/layout.tsx`) share one session lookup
// instead of round-tripping Better Auth twice per navigation.
// React `cache()` 在单次请求内复用结果，让 (auth) 与 studio 嵌套 layout
// 共用同一次 Better Auth 查询，避免每次导航查两遍 session。
export const getCurrentSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

// Per-request cached list of organizations the current user belongs to.
// 当前用户所属 org 列表，请求级缓存。
export const getCurrentOrganizations = cache(async () =>
  auth.api.listOrganizations({ headers: await headers() }),
);

// Resolve the user's active organization strictly from session.activeOrganizationId.
// 不再回退到 orgs[0] —— 这样上游（/page.tsx, /chat 等 legacy 入口）拿到 null 就
// 统一引导到 /select-workspace，对新用户也显式 onboard、对"被踢出原 org 的回
// 流用户"也能正确感知（auth.ts 的 session.create.after hook 会在 lastActive 失
// 效时清掉 user.lastActiveOrganizationId 并跳过 session.activeOrg 回填）。
//
// ⚠️ `/w/[slug]/...` 路径下这条 helper 会读到"切换租户请求里还没刷新"的旧
// session（layout.tsx 通过 setActiveOrganization 更新 DB/cookie，但同一个请求
// 里 React cache() 锁住了 getCurrentSession 的旧结果）。SSR pages 应该用
// `resolveOrganizationBySlug(slug)` 走 URL 权威；本 helper 只适合"没 slug 上
// 下文"的根入口（`src/app/page.tsx`）使用。
//
// Strict resolver: returns null when session.activeOrganizationId is missing
// or doesn't match any of the user's orgs. Callers redirect to
// /select-workspace on null — uniform handling for new users, recently-kicked
// users, and corrupted-session scenarios.
export const resolveActiveOrganization = cache(async () => {
  const session = await getCurrentSession();
  if (!session?.user) {
    return null;
  }
  const orgs = await getCurrentOrganizations();
  const activeId = (session.session as { activeOrganizationId?: string | null } | null)
    ?.activeOrganizationId;
  if (!activeId) {
    return null;
  }
  return orgs.find((o) => o.id === activeId) ?? null;
});

/**
 * 按 URL slug 解析 org —— SSR page 应该用这条而不是 `resolveActiveOrganization()`，
 * 避免"刚切换工作区时 session.activeOrganizationId 还指着上一个 org"的踩坑。
 * URL slug 已经在 layout 里通过 `getCurrentOrganizations` 校验过用户是该 org
 * 成员；这里只在该用户的 org 列表里找匹配。
 *
 * Resolve org by URL slug — preferred over `resolveActiveOrganization()` for
 * SSR pages so we don't read a stale session.activeOrganizationId immediately
 * after switching workspaces. Membership is already guaranteed by the layout
 * upstream calling `getCurrentOrganizations`.
 */
export const resolveOrganizationBySlug = cache(async (slug: string) => {
  const session = await getCurrentSession();
  if (!session?.user) {
    return null;
  }
  const orgs = await getCurrentOrganizations();
  return orgs.find((o) => o.slug === slug) ?? null;
});
