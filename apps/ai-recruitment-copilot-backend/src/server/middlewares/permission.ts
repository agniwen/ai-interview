// src/server/middlewares/permission.ts
//
// 资源-动作粒度的权限校验。通过 better-auth 官方 auth.api.hasPermission
// 完成，内部根据 session.activeOrganizationId + member.role 解析
// 自家 ac/roles 矩阵（见 src/lib/shared/permissions.ts）。

import { auth } from "@arc/ai-recruitment-copilot-backend/lib/server/auth";
import type { statement } from "@arc/shared/permissions";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { and, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { recruitingGroupMember } from "@arc/db-schema/schema";

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
