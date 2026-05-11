// src/server/middlewares/permission.ts
//
// 资源-动作粒度的权限校验。通过 better-auth 官方 auth.api.hasPermission
// 完成，内部根据 session.activeOrganizationId + member.role 解析
// 自家 ac/roles 矩阵（见 src/lib/shared/permissions.ts）。

import { auth } from "@/lib/server/auth";
import type { statement } from "@/lib/shared/permissions";
import { factory } from "@/server/factory";

type Resource = keyof typeof statement;
type Action<R extends Resource> = (typeof statement)[R][number];

export function requirePermission<R extends Resource>(resource: R, action: Action<R>) {
  return factory.createMiddleware(async (c, next) => {
    const result = await auth.api.hasPermission({
      body: {
        permissions: { [resource]: [action] } as Record<string, string[]>,
      },
      headers: c.req.raw.headers,
    });

    if (!result.success) {
      return c.json({ message: "Forbidden" }, 403);
    }

    return next();
  });
}
