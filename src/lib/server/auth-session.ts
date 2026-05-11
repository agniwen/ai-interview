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
