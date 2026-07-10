// src/server/middlewares/permission.ts
//
// 资源-动作粒度的权限校验。工作区必须来自本次 URL 解析结果，不能回退到
// 可被其他标签页修改的全局 session 状态。

import type { statement } from "@arc/shared/permissions";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { and, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { recruitingGroupMember } from "@arc/db-schema/schema";
import { hasWorkspacePermission } from "@arc/ai-recruitment-copilot-backend/server/access/workspace-permissions";

type Resource = keyof typeof statement;
type Action<R extends Resource> = (typeof statement)[R][number];

const RECRUITING_GROUP_RESOURCES = new Set<Resource>([
  "candidateForm",
  "department",
  "globalConfig",
  "interview",
  "interviewer",
  "jd",
  "resumeLibrary",
  "resumePool",
  "resumeUploadBatch",
  "questionTemplate",
]);

function groupRoleAllows(role: string, action: string) {
  if (action === "read") {
    return true;
  }
  return role === "hr" || role === "recruitingLead" || role === "recruitingSupervisor";
}

async function hasRecruitingGroupPermission({
  action,
  organizationId,
  userId,
}: {
  action: string;
  organizationId: string;
  userId: string;
}) {
  const rows = await db
    .select({ role: recruitingGroupMember.role })
    .from(recruitingGroupMember)
    .where(
      and(
        eq(recruitingGroupMember.organizationId, organizationId),
        eq(recruitingGroupMember.userId, userId),
      ),
    );
  return rows.some((row) => groupRoleAllows(row.role, action));
}

export function requirePermission<R extends Resource>(resource: R, action: Action<R>) {
  return factory.createMiddleware(async (c, next) => {
    const activeMember = c.var.member;
    if (activeMember?.role === "member" && RECRUITING_GROUP_RESOURCES.has(resource)) {
      const { activeOrg } = c.var;
      const { user } = c.var;
      const allowed =
        activeOrg && user
          ? await hasRecruitingGroupPermission({
              action,
              organizationId: activeOrg.id,
              userId: user.id,
            })
          : false;
      if (!allowed) {
        return c.json({ message: "Forbidden" }, 403);
      }
      return next();
    }

    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Forbidden" }, 403);
    }
    const allowed = await hasWorkspacePermission({
      action,
      headers: c.req.raw.headers,
      organizationId: activeOrg.id,
      resource,
    });

    if (!allowed) {
      return c.json({ message: "Forbidden" }, 403);
    }

    return next();
  });
}
