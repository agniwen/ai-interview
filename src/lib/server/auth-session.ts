import "server-only";

import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "./auth";

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

// Resolve the user's active organization: prefer session.activeOrganizationId,
// fall back to the first org so users with stale/unset active state still land
// somewhere sensible. Returns null when the user has no orgs.
// 解析当前活跃 org：优先 session.activeOrganizationId，未命中则回退到第一个 org。
//
// ⚠️ 这个 helper 在 `/w/[slug]/...` 路径下会有"切换租户的请求里 session 还没刷新"
// 的坑——layout.tsx 通过 setActiveOrganization 更新 DB/cookie，但同一个请求里
// React cache() 锁住了 getCurrentSession 的旧结果。SSR pages 应该用
// `resolveOrganizationBySlug(slug)` 改走 URL 权威，本 helper 只适合"没 slug
// 上下文"的根入口（`src/app/page.tsx`）使用。
// CAUTION: inside `/w/[slug]/...` SSR, this helper reads a stale session in
// the very request that switches workspaces (layout updates DB/cookie but
// React cache() pins the old session for the rest of the render). Slug-aware
// pages should use `resolveOrganizationBySlug(slug)` instead; this helper is
// fine for slugless entrypoints like `src/app/page.tsx`.
export const resolveActiveOrganization = cache(async () => {
  const session = await getCurrentSession();
  if (!session?.user) {
    return null;
  }
  const orgs = await getCurrentOrganizations();
  const activeId = (session.session as { activeOrganizationId?: string | null } | null)
    ?.activeOrganizationId;
  return orgs.find((o) => o.id === activeId) ?? orgs[0] ?? null;
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
