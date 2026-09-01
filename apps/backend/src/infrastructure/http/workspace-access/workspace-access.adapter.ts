import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { Request } from "express";
import { z } from "zod";
import {
  member,
  organization,
  organizationRole,
  recruitingGroupMember,
} from "@arc/db-schema/schema";
import {
  clonePermissionStatements,
  hasPermissionInStatements,
  normalizePermissionStatements,
} from "@arc/shared/permission-statements";
import type { WorkspacePermissionStatements } from "@arc/shared/permission-statements";
import { NO_ACCESS_WORKSPACE_ROLE, roles, statement } from "@arc/shared/permissions";
import type {
  WorkspaceAuthorizationContext,
  WorkspaceAuthorizationQueries,
  WorkspacePermission,
} from "../../../domains/identity-access/workspace-authorization/workspace-authorization.queries.js";
import type { WorkspaceAccessPort } from "./workspace-access.port.js";
import { API_DATABASE } from "../../database/database.tokens.js";
import type { Database } from "../../database/database.tokens.js";

type BuiltInRole = keyof typeof roles;
type WorkspaceResource = keyof typeof statement;

const RECRUITING_GROUP_RESOURCES = new Set<WorkspaceResource>([
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

function isBuiltInRole(role: string): role is BuiltInRole {
  return Object.hasOwn(roles, role);
}

function groupRoleAllows(role: string, action: string): boolean {
  return action === "read" || ["hr", "recruitingLead", "recruitingSupervisor"].includes(role);
}

function groupStatements(groupRoles: readonly string[]): WorkspacePermissionStatements {
  const result: WorkspacePermissionStatements = {};
  for (const resource of RECRUITING_GROUP_RESOURCES) {
    const actions = statement[resource].filter((action) =>
      groupRoles.some((role) => groupRoleAllows(role, action)),
    );
    if (actions.length > 0) {
      Object.assign(result, { [resource]: [...actions] });
    }
  }
  return result;
}

@Injectable()
export class WorkspaceAccessAdapter implements WorkspaceAccessPort, WorkspaceAuthorizationQueries {
  constructor(@Inject(API_DATABASE) private readonly database: Database) {}

  async authorize(
    context: WorkspaceAuthorizationContext,
    permission: WorkspacePermission,
  ): Promise<boolean> {
    const statements = await this.permissionStatements(context);
    if (!(permission.resource in statement)) {
      return false;
    }
    // SAFETY: the preceding membership check narrows the runtime resource to a key of statement.
    const resource = permission.resource as WorkspaceResource;
    // SAFETY: every statement entry is an immutable list of the actions for that resource.
    if (!(statement[resource] as readonly string[]).includes(permission.action)) {
      return false;
    }
    // SAFETY: the statement lookup above proves the action belongs to this resource's action union.
    return hasPermissionInStatements(statements, resource, permission.action as never);
  }

  async resolve(request: Request, slug: string): Promise<WorkspaceAuthorizationContext> {
    const actor = request.authContext?.user;
    if (!actor) {
      throw new UnauthorizedException("Authentication required", {
        errorCode: "AUTHENTICATION_REQUIRED",
      });
    }
    if (!slug) {
      throw new BadRequestException("Workspace slug is required", {
        errorCode: "WORKSPACE_SLUG_REQUIRED",
      });
    }

    const [workspace] = await this.database
      .select({
        id: organization.id,
        logo: organization.logo,
        metadata: organization.metadata,
        name: organization.name,
        slug: organization.slug,
      })
      .from(organization)
      .where(eq(organization.slug, slug))
      .limit(1);
    if (!workspace) {
      throw new NotFoundException("Workspace not found", {
        errorCode: "WORKSPACE_NOT_FOUND",
      });
    }

    const [activeMember] = await this.database
      .select({
        id: member.id,
        organizationId: member.organizationId,
        role: member.role,
        userId: member.userId,
      })
      .from(member)
      .where(and(eq(member.organizationId, workspace.id), eq(member.userId, actor.id)))
      .limit(1);
    if (!activeMember || activeMember.role === NO_ACCESS_WORKSPACE_ROLE) {
      throw new ForbiddenException("Forbidden", { errorCode: "WORKSPACE_ACCESS_DENIED" });
    }

    return {
      actor: { email: actor.email, id: actor.id, name: actor.name },
      member: activeMember,
      workspace,
    };
  }

  private async permissionStatements(
    context: WorkspaceAuthorizationContext,
  ): Promise<WorkspacePermissionStatements> {
    const { role } = context.member;
    if (role === NO_ACCESS_WORKSPACE_ROLE) {
      return {};
    }

    let roleStatements: WorkspacePermissionStatements;
    if (isBuiltInRole(role)) {
      roleStatements = normalizePermissionStatements(z.json().parse(roles[role].statements));
    } else {
      const [dynamicRole] = await this.database
        .select({ permission: organizationRole.permission })
        .from(organizationRole)
        .where(
          and(
            eq(organizationRole.organizationId, context.workspace.id),
            eq(organizationRole.role, role),
          ),
        )
        .limit(1);
      if (!dynamicRole) {
        return {};
      }
      try {
        roleStatements = normalizePermissionStatements(
          z.json().parse(JSON.parse(dynamicRole.permission)),
        );
      } catch {
        return {};
      }
    }

    if (role !== "member") {
      return clonePermissionStatements(roleStatements);
    }

    const memberships = await this.database
      .select({ role: recruitingGroupMember.role })
      .from(recruitingGroupMember)
      .where(
        and(
          eq(recruitingGroupMember.organizationId, context.workspace.id),
          eq(recruitingGroupMember.userId, context.actor.id),
        ),
      );
    const recruitingStatements = groupStatements(memberships.map((row) => row.role));
    const merged: WorkspacePermissionStatements = {};
    for (const [resource, actions] of Object.entries(roleStatements)) {
      // SAFETY: Object.entries is iterating the typed WorkspacePermissionStatements keys.
      if (!RECRUITING_GROUP_RESOURCES.has(resource as WorkspaceResource) && actions) {
        Object.assign(merged, { [resource]: [...actions] });
      }
    }
    for (const resource of RECRUITING_GROUP_RESOURCES) {
      const actions = recruitingStatements[resource];
      if (actions?.length) {
        Object.assign(merged, { [resource]: [...actions] });
      }
    }
    return merged;
  }
}
