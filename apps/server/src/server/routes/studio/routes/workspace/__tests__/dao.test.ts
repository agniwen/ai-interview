import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@app/server/lib/server/db";
import {
  account,
  member,
  organization,
  recruitingGroup,
  recruitingGroupMember,
  user,
} from "@arc/db-schema/schema";
import {
  addMemberToDefaultRecruitingGroup,
  ensureDefaultRecruitingGroupForWorkspace,
  listWorkspaceMembers,
  listWorkspaceMemberLastActives,
  listRecruitingGroupBoard,
  queryPaginatedWorkspaceMembers,
  UNGROUPED_RECRUITING_GROUP_ID,
} from "../dao";

const ORG = "test_workspace_groups_org";
const CREATOR = "test_workspace_groups_creator";
const MEMBER = "test_workspace_groups_member";

async function clean() {
  await db.delete(recruitingGroupMember).where(eq(recruitingGroupMember.organizationId, ORG));
  await db.delete(recruitingGroup).where(eq(recruitingGroup.organizationId, ORG));
  await db.delete(member).where(eq(member.organizationId, ORG));
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(user).where(eq(user.id, CREATOR));
  await db.delete(user).where(eq(user.id, MEMBER));
}

describe("workspace recruiting group dao", () => {
  beforeEach(async () => {
    await clean();
    await db.insert(user).values({
      createdAt: new Date(),
      email: "creator@workspace-groups.test",
      emailVerified: true,
      id: CREATOR,
      name: "Creator",
      updatedAt: new Date(),
    });
    await db.insert(user).values({
      createdAt: new Date(),
      email: "member@workspace-groups.test",
      emailVerified: true,
      id: MEMBER,
      name: "Member",
      updatedAt: new Date(),
    });
    await db.insert(organization).values({
      createdAt: new Date(),
      id: ORG,
      name: "Workspace Groups Org",
      slug: "workspace-groups-org",
    });
    await db.insert(member).values({
      createdAt: new Date(),
      id: "m_workspace_groups_creator",
      organizationId: ORG,
      role: "owner",
      userId: CREATOR,
    });
    await db.insert(member).values({
      createdAt: new Date(),
      id: "m_workspace_groups_member",
      organizationId: ORG,
      role: "member",
      userId: MEMBER,
    });
  }, 30_000);

  afterEach(clean, 30_000);

  it("creates one default recruiting group and adds the creator as supervisor", async () => {
    const group = await ensureDefaultRecruitingGroupForWorkspace({
      creatorUserId: CREATOR,
      organizationId: ORG,
    });

    expect(group.name).toBe("默认招聘组");
    expect(group.isDefault).toBe(true);

    const memberships = await db
      .select({
        groupId: recruitingGroupMember.groupId,
        role: recruitingGroupMember.role,
        userId: recruitingGroupMember.userId,
      })
      .from(recruitingGroupMember)
      .where(eq(recruitingGroupMember.organizationId, ORG));

    expect(memberships).toEqual([
      { groupId: group.id, role: "recruitingSupervisor", userId: CREATOR },
    ]);
  }, 30_000);

  it("is idempotent for repeated workspace initialization", async () => {
    const first = await ensureDefaultRecruitingGroupForWorkspace({
      creatorUserId: CREATOR,
      organizationId: ORG,
    });
    const second = await ensureDefaultRecruitingGroupForWorkspace({
      creatorUserId: CREATOR,
      organizationId: ORG,
    });

    expect(second.id).toBe(first.id);

    const groups = await db
      .select({ id: recruitingGroup.id })
      .from(recruitingGroup)
      .where(and(eq(recruitingGroup.organizationId, ORG), eq(recruitingGroup.isDefault, true)));
    const memberships = await db
      .select({ userId: recruitingGroupMember.userId })
      .from(recruitingGroupMember)
      .where(eq(recruitingGroupMember.organizationId, ORG));

    expect(groups).toHaveLength(1);
    expect(memberships).toHaveLength(1);
  }, 30_000);

  it("adds a workspace member to the default recruiting group as HR", async () => {
    const defaultGroup = await ensureDefaultRecruitingGroupForWorkspace({
      creatorUserId: CREATOR,
      organizationId: ORG,
    });

    const first = await addMemberToDefaultRecruitingGroup({
      createdBy: CREATOR,
      organizationId: ORG,
      userId: MEMBER,
    });
    const second = await addMemberToDefaultRecruitingGroup({
      createdBy: CREATOR,
      organizationId: ORG,
      userId: MEMBER,
    });

    expect(first.status).toBe("created");
    expect(second.status).toBe("duplicate");

    const rows = await db
      .select({
        groupId: recruitingGroupMember.groupId,
        role: recruitingGroupMember.role,
        userId: recruitingGroupMember.userId,
      })
      .from(recruitingGroupMember)
      .where(eq(recruitingGroupMember.organizationId, ORG))
      .orderBy(recruitingGroupMember.userId);

    expect(rows).toEqual([
      { groupId: defaultGroup.id, role: "recruitingSupervisor", userId: CREATOR },
      { groupId: defaultGroup.id, role: "hr", userId: MEMBER },
    ]);
  }, 30_000);

  it("appends an ungrouped column for workspace members without group memberships", async () => {
    const defaultGroup = await ensureDefaultRecruitingGroupForWorkspace({
      creatorUserId: CREATOR,
      organizationId: ORG,
    });

    const groups = await listRecruitingGroupBoard(ORG);

    expect(groups.map((group) => group.id)).toEqual([
      defaultGroup.id,
      UNGROUPED_RECRUITING_GROUP_ID,
    ]);
    expect(groups[0]).toMatchObject({
      id: defaultGroup.id,
      isDefault: true,
      memberUserIds: [CREATOR],
    });
    expect(groups[1]).toMatchObject({
      id: UNGROUPED_RECRUITING_GROUP_ID,
      isVirtual: true,
      memberUserIds: [MEMBER],
      name: "未分组",
    });
    expect(groups[1]?.members).toEqual([expect.objectContaining({ role: null, userId: MEMBER })]);
  }, 30_000);

  it("lists each member's available Feishu app sources", async () => {
    const now = new Date();
    await db.insert(account).values([
      {
        accountId: "ou_workspace_member_primary",
        createdAt: now,
        id: "account_workspace_member_primary",
        issuer: "local:oauth:feishu",
        providerId: "feishu",
        updatedAt: now,
        userId: MEMBER,
      },
      {
        accountId: "ou_workspace_member_secondary",
        createdAt: now,
        id: "account_workspace_member_secondary",
        issuer: "local:oauth:feishu-jiguang-hr",
        providerId: "feishu-jiguang-hr",
        updatedAt: now,
        userId: MEMBER,
      },
    ]);

    const members = await listWorkspaceMembers(ORG);

    expect(members).toEqual([
      expect.objectContaining({
        feishuProviderIds: ["feishu-jiguang-hr"],
        id: CREATOR,
        memberId: "m_workspace_groups_creator",
        role: "owner",
      }),
      expect.objectContaining({
        feishuProviderIds: ["feishu", "feishu-jiguang-hr"],
        id: MEMBER,
        memberId: "m_workspace_groups_member",
        role: "member",
      }),
    ]);
  }, 30_000);

  it("serializes an aggregated member last-active timestamp", async () => {
    const lastActiveAt = new Date("2026-08-19T06:30:00.000Z");
    await db.update(user).set({ lastActiveAt }).where(eq(user.id, MEMBER));

    const records = await listWorkspaceMemberLastActives(ORG);

    expect(records).toContainEqual({
      lastActiveAt: lastActiveAt.toISOString(),
      userId: MEMBER,
    });
  }, 30_000);

  it("paginates members by newest join time and supports last-active sorting", async () => {
    await db
      .update(member)
      .set({ createdAt: new Date("2026-08-01T00:00:00.000Z") })
      .where(eq(member.userId, CREATOR));
    await db
      .update(member)
      .set({ createdAt: new Date("2026-08-20T00:00:00.000Z") })
      .where(eq(member.userId, MEMBER));
    await db
      .update(user)
      .set({ lastActiveAt: new Date("2026-08-30T00:00:00.000Z") })
      .where(eq(user.id, CREATOR));
    await db
      .update(user)
      .set({ lastActiveAt: new Date("2026-08-10T00:00:00.000Z") })
      .where(eq(user.id, MEMBER));

    const firstPage = await queryPaginatedWorkspaceMembers(ORG, {
      page: 1,
      pageSize: 1,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
    const byLastActive = await queryPaginatedWorkspaceMembers(ORG, {
      page: 1,
      pageSize: 10,
      sortBy: "lastActiveAt",
      sortOrder: "desc",
    });

    expect(firstPage).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(firstPage.records.map((row) => row.userId)).toEqual([MEMBER]);
    expect(byLastActive.records.map((row) => row.userId)).toEqual([CREATOR, MEMBER]);
  }, 30_000);

  it("keeps tied and never-active member pagination stable and filters before counting", async () => {
    const joinedAt = new Date("2026-08-01T00:00:00.000Z");
    await db.update(member).set({ createdAt: joinedAt }).where(eq(member.organizationId, ORG));

    const firstPage = await queryPaginatedWorkspaceMembers(ORG, {
      page: 1,
      pageSize: 1,
      sortBy: "lastActiveAt",
      sortOrder: "desc",
    });
    const secondPage = await queryPaginatedWorkspaceMembers(ORG, {
      page: 2,
      pageSize: 1,
      sortBy: "lastActiveAt",
      sortOrder: "desc",
    });
    const filtered = await queryPaginatedWorkspaceMembers(ORG, {
      page: 1,
      pageSize: 10,
      sortBy: "createdAt",
      sortOrder: "desc",
      textFilters: '{"name":"Creator"}',
    });

    expect([...firstPage.records, ...secondPage.records].map((row) => row.id)).toEqual([
      "m_workspace_groups_member",
      "m_workspace_groups_creator",
    ]);
    expect(firstPage.records[0]?.lastActiveAt).toBeNull();
    expect(secondPage.records[0]?.lastActiveAt).toBeNull();
    expect(filtered).toMatchObject({ total: 1, totalPages: 1 });
    expect(filtered.records.map((row) => row.userId)).toEqual([CREATOR]);
  }, 30_000);
});
