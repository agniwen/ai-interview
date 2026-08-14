// src/server/middlewares/permission.ts
//
// 资源-动作粒度的权限校验。工作区必须来自本次 URL 解析结果，不能回退到
// 可被其他标签页修改的全局 session 状态。

import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import {
  getWorkspaceRequestContext,
  WorkspaceContextInvariantError,
} from "@arc/ai-recruitment-copilot-backend/server/context/workspace-request-context";
import { createRequestWorkspaceAuthorizer } from "@arc/ai-recruitment-copilot-backend/server/access/workspace-access-policy";
import type {
  WorkspaceAction,
  WorkspaceResource,
} from "@arc/ai-recruitment-copilot-backend/server/access/workspace-access-policy";

export function requirePermission<R extends WorkspaceResource>(
  resource: R,
  action: WorkspaceAction<R>,
) {
  return factory.createMiddleware(async (c, next) => {
    let workspaceContext;
    try {
      workspaceContext = getWorkspaceRequestContext(c);
    } catch (error) {
      if (error instanceof WorkspaceContextInvariantError) {
        return c.json({ message: "Forbidden" }, 403);
      }
      throw error;
    }
    const { member, organization, user } = workspaceContext;
    const authorize = createRequestWorkspaceAuthorizer({
      headers: c.req.raw.headers,
      memberRole: member.role,
      organizationId: organization.id,
      userId: user.id,
    });
    const allowed = await authorize({ action, resource });

    if (!allowed) {
      return c.json({ message: "Forbidden" }, 403);
    }

    return next();
  });
}
