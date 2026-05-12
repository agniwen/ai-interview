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
