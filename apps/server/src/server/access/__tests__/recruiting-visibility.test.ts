import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@app/server/lib/server/db";
import {
  member,
  organization,
  recruitingGroup,
  recruitingGroupMember,
  user,
} from "@arc/db-schema/schema";
import {
  intersectRequestedCreatorIds,
  resolveRecruitingVisibilityScope,
} from "@app/server/server/access/recruiting-visibility";

const ORG = "test_org_recruiting_visibility";
const OTHER_ORG = "test_org_recruiting_visibility_other";
const NOW = new Date("2026-06-10T10:00:00.000Z");

const USERS = {
  admin: "test_vis_admin",
  groupAExternal: "test_vis_group_a_external",
  groupAHr: "test_vis_group_a_hr",
  groupALead: "test_vis_group_a_lead",
  groupASupervisor: "test_vis_group_a_supervisor",
  groupAViewer: "test_vis_group_a_viewer",
  groupBHr: "test_vis_group_b_hr",
  groupBLead: "test_vis_group_b_lead",
  multiGroupLead: "test_vis_multi_group_lead",
  owner: "test_vis_owner",
  ungroupedHr: "test_vis_ungrouped_hr",
  ungroupedLead: "test_vis_ungrouped_lead",
  ungroupedSupervisor: "test_vis_ungrouped_supervisor",
  ungroupedViewer: "test_vis_ungrouped_viewer",
} as const;

const GROUP_A = "test_vis_group_a";
const GROUP_B = "test_vis_group_b";

async function cleanup() {
  await db.delete(recruitingGroupMember).where(eq(recruitingGroupMember.organizationId, ORG));
  await db.delete(recruitingGroupMember).where(eq(recruitingGroupMember.organizationId, OTHER_ORG));
  await db.delete(recruitingGroup).where(eq(recruitingGroup.organizationId, ORG));
  await db.delete(recruitingGroup).where(eq(recruitingGroup.organizationId, OTHER_ORG));
  for (const userId of Object.values(USERS)) {
    await db.delete(member).where(eq(member.userId, userId));
    await db.delete(user).where(eq(user.id, userId));
  }
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(organization).where(eq(organization.id, OTHER_ORG));
}

beforeAll(async () => {
  await cleanup();

  await db.insert(user).values(
    Object.entries(USERS).map(([key, id]) => ({
      createdAt: NOW,
      email: `${key}@visibility.test`,
      emailVerified: false,
      id,
      name: key,
      updatedAt: NOW,
    })),
  );

  await db.insert(organization).values([
    { createdAt: NOW, id: ORG, name: "Visibility Org", slug: "visibility-org" },
    {
      createdAt: NOW,
      id: OTHER_ORG,
      name: "Visibility Other Org",
      slug: "visibility-other-org",
    },
  ]);

  await db.insert(member).values([
    {
      createdAt: NOW,
      id: "m_vis_owner",
      organizationId: ORG,
      role: "owner",
      userId: USERS.owner,
    },
    {
      createdAt: NOW,
      id: "m_vis_admin",
      organizationId: ORG,
      role: "admin",
      userId: USERS.admin,
    },
    {
      createdAt: NOW,
      id: "m_vis_group_a_supervisor",
      organizationId: ORG,
      role: "member",
      userId: USERS.groupASupervisor,
    },
    {
      createdAt: NOW,
      id: "m_vis_group_a_lead",
      organizationId: ORG,
      role: "member",
      userId: USERS.groupALead,
    },
    {
      createdAt: NOW,
      id: "m_vis_group_a_hr",
      organizationId: ORG,
      role: "member",
      userId: USERS.groupAHr,
    },
    {
      createdAt: NOW,
      id: "m_vis_group_a_viewer",
      organizationId: ORG,
      role: "member",
      userId: USERS.groupAViewer,
    },
    {
      createdAt: NOW,
      id: "m_vis_group_a_external",
      organizationId: ORG,
      role: "member",
      userId: USERS.groupAExternal,
    },
    {
      createdAt: NOW,
      id: "m_vis_group_b_lead",
      organizationId: ORG,
      role: "member",
      userId: USERS.groupBLead,
    },
    {
      createdAt: NOW,
      id: "m_vis_group_b_hr",
      organizationId: ORG,
      role: "member",
      userId: USERS.groupBHr,
    },
    {
      createdAt: NOW,
      id: "m_vis_multi_group_lead",
      organizationId: ORG,
      role: "member",
      userId: USERS.multiGroupLead,
    },
    {
      createdAt: NOW,
      id: "m_vis_ungrouped_hr",
      organizationId: ORG,
      role: "member",
      userId: USERS.ungroupedHr,
    },
    {
      createdAt: NOW,
      id: "m_vis_ungrouped_lead",
      organizationId: ORG,
      role: "member",
      userId: USERS.ungroupedLead,
    },
    {
      createdAt: NOW,
      id: "m_vis_ungrouped_supervisor",
      organizationId: ORG,
      role: "member",
      userId: USERS.ungroupedSupervisor,
    },
    {
      createdAt: NOW,
      id: "m_vis_ungrouped_viewer",
      organizationId: ORG,
      role: "member",
      userId: USERS.ungroupedViewer,
    },
  ]);

  await db.insert(recruitingGroup).values([
    {
      createdAt: NOW,
      createdBy: USERS.admin,
      id: GROUP_A,
      name: "A 组",
      organizationId: ORG,
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      createdBy: USERS.admin,
      id: GROUP_B,
      name: "B 组",
      organizationId: ORG,
      updatedAt: NOW,
    },
  ]);

  await db.insert(recruitingGroupMember).values([
    {
      createdAt: NOW,
      groupId: GROUP_A,
      id: "rgm_vis_group_a_supervisor",
      organizationId: ORG,
      role: "recruitingSupervisor",
      userId: USERS.groupASupervisor,
    },
    {
      createdAt: NOW,
      groupId: GROUP_A,
      id: "rgm_vis_group_a_lead",
      organizationId: ORG,
      role: "recruitingLead",
      userId: USERS.groupALead,
    },
    {
      createdAt: NOW,
      groupId: GROUP_A,
      id: "rgm_vis_group_a_hr",
      organizationId: ORG,
      role: "hr",
      userId: USERS.groupAHr,
    },
    {
      createdAt: NOW,
      groupId: GROUP_A,
      id: "rgm_vis_group_a_viewer",
      organizationId: ORG,
      role: "viewer",
      userId: USERS.groupAViewer,
    },
    {
      createdAt: NOW,
      groupId: GROUP_A,
      id: "rgm_vis_group_a_external",
      organizationId: ORG,
      role: "recruitingSupervisor",
      userId: USERS.groupAExternal,
    },
    {
      createdAt: NOW,
      groupId: GROUP_B,
      id: "rgm_vis_group_b_lead",
      organizationId: ORG,
      role: "recruitingLead",
      userId: USERS.groupBLead,
    },
    {
      createdAt: NOW,
      groupId: GROUP_B,
      id: "rgm_vis_group_b_hr",
      organizationId: ORG,
      role: "hr",
      userId: USERS.groupBHr,
    },
    {
      createdAt: NOW,
      groupId: GROUP_A,
      id: "rgm_vis_multi_group_a",
      organizationId: ORG,
      role: "viewer",
      userId: USERS.multiGroupLead,
    },
    {
      createdAt: NOW,
      groupId: GROUP_B,
      id: "rgm_vis_multi_group_b",
      organizationId: ORG,
      role: "recruitingLead",
      userId: USERS.multiGroupLead,
    },
  ]);
});

afterAll(cleanup);

describe("resolveRecruitingVisibilityScope", () => {
  it("allows owners to see all recruiting data in the workspace", async () => {
    await expect(
      resolveRecruitingVisibilityScope({ organizationId: ORG, userId: USERS.owner }),
    ).resolves.toEqual({ kind: "all" });
  });

  it("trusts the request-scoped owner role resolved by workspace middleware", async () => {
    await expect(
      resolveRecruitingVisibilityScope({
        currentRole: "owner",
        organizationId: ORG,
        userId: USERS.groupAHr,
      }),
    ).resolves.toEqual({ kind: "all" });
  });

  it("allows admins to see all recruiting data in the workspace", async () => {
    await expect(
      resolveRecruitingVisibilityScope({ organizationId: ORG, userId: USERS.admin }),
    ).resolves.toEqual({ kind: "all" });
  });

  it("treats blank creator filters as no filter for all-data roles", () => {
    expect(intersectRequestedCreatorIds([], { kind: "all" })).toBeNull();
    expect(intersectRequestedCreatorIds([""], { kind: "all" })).toBeNull();
    expect(intersectRequestedCreatorIds([USERS.groupAHr], { kind: "all" })).toEqual([
      USERS.groupAHr,
    ]);
  });

  it("lets a supervisor see lower-level members in the same group but not peers or other groups", async () => {
    const scope = await resolveRecruitingVisibilityScope({
      organizationId: ORG,
      userId: USERS.groupASupervisor,
    });

    expect(scope).toEqual({
      kind: "restricted",
      userIds: expect.arrayContaining([
        USERS.groupASupervisor,
        USERS.groupALead,
        USERS.groupAHr,
        USERS.groupAViewer,
      ]),
    });
    expect(scope.kind === "restricted" ? scope.userIds : []).not.toContain(USERS.groupAExternal);
    expect(scope.kind === "restricted" ? scope.userIds : []).not.toContain(USERS.groupBHr);
  });

  it("lets a lead see group members below lead level only", async () => {
    await expect(
      resolveRecruitingVisibilityScope({ organizationId: ORG, userId: USERS.groupALead }),
    ).resolves.toEqual({
      kind: "restricted",
      userIds: expect.arrayContaining([USERS.groupALead, USERS.groupAHr, USERS.groupAViewer]),
    });
  });

  it("merges visibility from every recruiting group membership using the role in that group", async () => {
    const scope = await resolveRecruitingVisibilityScope({
      organizationId: ORG,
      userId: USERS.multiGroupLead,
    });

    expect(scope).toEqual({
      kind: "restricted",
      userIds: expect.arrayContaining([USERS.multiGroupLead, USERS.groupBHr]),
    });
    expect(scope.kind === "restricted" ? scope.userIds : []).not.toContain(USERS.groupAHr);
    expect(scope.kind === "restricted" ? scope.userIds : []).not.toContain(USERS.groupALead);
  });

  it("limits hr and viewer members to their own data", async () => {
    await expect(
      resolveRecruitingVisibilityScope({ organizationId: ORG, userId: USERS.groupAHr }),
    ).resolves.toEqual({ kind: "restricted", userIds: [USERS.groupAHr] });
    await expect(
      resolveRecruitingVisibilityScope({ organizationId: ORG, userId: USERS.groupAViewer }),
    ).resolves.toEqual({ kind: "restricted", userIds: [USERS.groupAViewer] });
  });

  it("does not treat ungrouped members as a default recruiting group", async () => {
    await expect(
      resolveRecruitingVisibilityScope({ organizationId: ORG, userId: USERS.ungroupedLead }),
    ).resolves.toEqual({ kind: "restricted", userIds: [USERS.ungroupedLead] });
    await expect(
      resolveRecruitingVisibilityScope({ organizationId: ORG, userId: USERS.ungroupedSupervisor }),
    ).resolves.toEqual({ kind: "restricted", userIds: [USERS.ungroupedSupervisor] });
  });

  it("limits ungrouped hr and viewer members to their own data", async () => {
    await expect(
      resolveRecruitingVisibilityScope({ organizationId: ORG, userId: USERS.ungroupedHr }),
    ).resolves.toEqual({ kind: "restricted", userIds: [USERS.ungroupedHr] });
    await expect(
      resolveRecruitingVisibilityScope({ organizationId: ORG, userId: USERS.ungroupedViewer }),
    ).resolves.toEqual({ kind: "restricted", userIds: [USERS.ungroupedViewer] });
  });

  it("returns none when the user is not a member of the workspace", async () => {
    await expect(
      resolveRecruitingVisibilityScope({ organizationId: OTHER_ORG, userId: USERS.groupBHr }),
    ).resolves.toEqual({ kind: "none" });
  });
});
