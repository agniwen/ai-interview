import { nanoid } from "nanoid";
import { db } from "../../../lib/server/db/index";
import { addMemberToDefaultRecruitingGroup } from "../studio/routes/workspace/dao";
import { notifyWorkspaceInviteCreatorMemberJoinedSafely } from "../studio/routes/workspace/utils/workspace-member-joined-notification";
import { member } from "@app/db-schema/schema";
import { NO_ACCESS_WORKSPACE_ROLE } from "@app/shared/permissions";

export interface JoinPreview {
  valid: boolean;
  initialRole?: string;
  workspace?: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
  };
  alreadyMember?: boolean;
}

export async function getJoinPreview(input: {
  code: string;
  userId: string | null;
}): Promise<JoinPreview> {
  const link = await db.query.workspaceInviteLink.findFirst({
    where: { code: input.code, disabledAt: { isNull: true } },
  });
  if (!link) {
    return { valid: false };
  }
  const org = await db.query.organization.findFirst({
    where: { id: link.organizationId },
  });
  if (!org) {
    return { valid: false };
  }
  let alreadyMember = false;
  if (input.userId) {
    const existing = await db.query.member.findFirst({
      where: { organizationId: org.id, userId: input.userId },
    });
    alreadyMember = Boolean(existing);
  }
  return {
    alreadyMember,
    initialRole: link.initialRole,
    valid: true,
    workspace: { id: org.id, logo: org.logo, name: org.name, slug: org.slug },
  };
}

export class JoinError extends Error {
  code: "link_invalid";
  constructor(code: "link_invalid") {
    super(code);
    this.name = "JoinError";
    this.code = code;
  }
}

export interface AcceptResult {
  status: "joined" | "already_member";
  organizationId: string;
  organizationSlug: string;
  role: string;
}

export async function acceptInviteLink(input: {
  code: string;
  userId: string;
}): Promise<AcceptResult> {
  let inviteLinkCreatorId: string | null = null;
  const result = await db.transaction(async (tx) => {
    const link = await tx.query.workspaceInviteLink.findFirst({
      where: { code: input.code, disabledAt: { isNull: true } },
    });
    if (!link) {
      throw new JoinError("link_invalid");
    }
    inviteLinkCreatorId = link.createdBy;

    const org = await tx.query.organization.findFirst({
      where: { id: link.organizationId },
    });
    if (!org) {
      throw new JoinError("link_invalid");
    }

    const existing = await tx.query.member.findFirst({
      where: { organizationId: org.id, userId: input.userId },
    });
    if (existing) {
      return {
        organizationId: org.id,
        organizationSlug: org.slug,
        role: existing.role,
        status: "already_member" as const,
      };
    }

    const initialRole = link.initialRole || NO_ACCESS_WORKSPACE_ROLE;
    try {
      await tx.insert(member).values({
        createdAt: new Date(),
        id: `mem_${nanoid(16)}`,
        inviteLinkId: link.id,
        organizationId: org.id,
        role: initialRole,
        userId: input.userId,
      });
    } catch (error) {
      // member_user_org_uq 兜底: 并发场景下另一个请求已插入。
      const again = await tx.query.member.findFirst({
        where: { organizationId: org.id, userId: input.userId },
      });
      if (again) {
        return {
          organizationId: org.id,
          organizationSlug: org.slug,
          role: again.role,
          status: "already_member" as const,
        };
      }
      throw error;
    }
    return {
      organizationId: org.id,
      organizationSlug: org.slug,
      role: initialRole,
      status: "joined" as const,
    };
  });

  if (result.status === "joined" && result.role === "member") {
    await addMemberToDefaultRecruitingGroup({
      createdBy: inviteLinkCreatorId,
      organizationId: result.organizationId,
      userId: input.userId,
    });
  }
  if (result.status === "joined") {
    await notifyWorkspaceInviteCreatorMemberJoinedSafely({
      creatorUserId: inviteLinkCreatorId,
      joinedUserId: input.userId,
      organizationId: result.organizationId,
    });
  }

  return result;
}
