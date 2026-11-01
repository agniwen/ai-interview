import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../../../../infrastructure/db/index";
import { account, member, organization, user } from "@app/db-schema/schema";
import {
  listWorkspaceMembers,
  listWorkspaceMemberLastActives,
  listWorkspaceMemberDirectory,
  reassignReportsBeforeMemberRemoval,
  setWorkspaceMemberDottedManagers,
  setWorkspaceMemberManager,
  setWorkspaceMemberPeerSharing,
} from "../dao";

const ORG = "test_workspace_groups_org";
const CREATOR = "test_workspace_groups_creator";
const MEMBER = "test_workspace_groups_member";

async function clean() {
  await db.delete(member).where(eq(member.organizationId, ORG));
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(user).where(eq(user.id, CREATOR));
  await db.delete(user).where(eq(user.id, MEMBER));
}

describe("workspace member dao", () => {
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

  it("lists every member with last activity and direct manager", async () => {
    await db
      .update(user)
      .set({ lastActiveAt: new Date("2026-08-30T00:00:00.000Z") })
      .where(eq(user.id, CREATOR));
    await setWorkspaceMemberManager({
      actorUserId: CREATOR,
      managerUserId: CREATOR,
      organizationId: ORG,
      userIds: [MEMBER],
    });

    const records = await listWorkspaceMemberDirectory(ORG);

    expect(records).toEqual([
      expect.objectContaining({
        lastActiveAt: "2026-08-30T00:00:00.000Z",
        managerUserId: null,
        shareWithPeers: false,
        userId: CREATOR,
      }),
      expect.objectContaining({ lastActiveAt: null, managerUserId: CREATOR, userId: MEMBER }),
    ]);
  }, 30_000);

  it("rejects self and cyclic managers and clears a manager with null", async () => {
    await expect(
      setWorkspaceMemberManager({
        actorUserId: CREATOR,
        managerUserId: MEMBER,
        organizationId: ORG,
        userIds: [MEMBER],
      }),
    ).resolves.toBe("self");
    await setWorkspaceMemberManager({
      actorUserId: CREATOR,
      managerUserId: CREATOR,
      organizationId: ORG,
      userIds: [MEMBER],
    });
    await expect(
      setWorkspaceMemberManager({
        actorUserId: CREATOR,
        managerUserId: MEMBER,
        organizationId: ORG,
        userIds: [CREATOR],
      }),
    ).resolves.toBe("cycle");

    await setWorkspaceMemberManager({
      actorUserId: CREATOR,
      managerUserId: null,
      organizationId: ORG,
      userIds: [MEMBER],
    });
    const records = await listWorkspaceMemberDirectory(ORG);
    expect(records.every((record) => record.managerUserId === null)).toBe(true);
  }, 30_000);

  it("hands a leaving manager's reports to their own manager", async () => {
    await setWorkspaceMemberManager({
      actorUserId: CREATOR,
      managerUserId: CREATOR,
      organizationId: ORG,
      userIds: [MEMBER],
    });

    await reassignReportsBeforeMemberRemoval({ organizationId: ORG, userId: CREATOR });

    const records = await listWorkspaceMemberDirectory(ORG);
    expect(records.find((record) => record.userId === MEMBER)?.managerUserId).toBeNull();
  }, 30_000);

  it("keeps the manager when peer sharing is toggled and vice versa", async () => {
    await setWorkspaceMemberManager({
      actorUserId: CREATOR,
      managerUserId: CREATOR,
      organizationId: ORG,
      userIds: [MEMBER],
    });
    await expect(
      setWorkspaceMemberPeerSharing({
        actorUserId: CREATOR,
        organizationId: ORG,
        shareWithPeers: true,
        userId: MEMBER,
      }),
    ).resolves.toBe("updated");
    await setWorkspaceMemberManager({
      actorUserId: CREATOR,
      managerUserId: null,
      organizationId: ORG,
      userIds: [MEMBER],
    });

    const records = await listWorkspaceMemberDirectory(ORG);
    expect(records.find((record) => record.userId === MEMBER)).toMatchObject({
      managerUserId: null,
      shareWithPeers: true,
    });
  }, 30_000);

  it("sets one manager for several members atomically and rejects selected managers", async () => {
    await expect(
      setWorkspaceMemberManager({
        actorUserId: CREATOR,
        managerUserId: MEMBER,
        organizationId: ORG,
        userIds: [CREATOR, MEMBER],
      }),
    ).resolves.toBe("self");
    await expect(
      setWorkspaceMemberManager({
        actorUserId: CREATOR,
        managerUserId: CREATOR,
        organizationId: ORG,
        userIds: [MEMBER, "test_workspace_groups_missing"],
      }),
    ).resolves.toBe("member-not-found");

    const records = await listWorkspaceMemberDirectory(ORG);
    expect(records.every((record) => record.managerUserId === null)).toBe(true);
  }, 30_000);

  it("stores dotted-line managers and blocks cycles through them", async () => {
    await expect(
      setWorkspaceMemberDottedManagers({
        actorUserId: CREATOR,
        managerUserIds: [CREATOR],
        organizationId: ORG,
        userId: MEMBER,
      }),
    ).resolves.toBe("updated");
    await expect(
      setWorkspaceMemberManager({
        actorUserId: CREATOR,
        managerUserId: MEMBER,
        organizationId: ORG,
        userIds: [CREATOR],
      }),
    ).resolves.toBe("cycle");

    const records = await listWorkspaceMemberDirectory(ORG);
    expect(records.find((record) => record.userId === MEMBER)?.dottedManagerUserIds).toEqual([
      CREATOR,
    ]);
  }, 30_000);
});
