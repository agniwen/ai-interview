import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@app/server/lib/server/db";
import { member, organization, user, workspaceInviteLink } from "@arc/db-schema/schema";
import {
  createInviteLink,
  disableInviteLink,
  enableInviteLink,
  findActiveLinkByCode,
  listInviteLinks,
  listLinkMembers,
  updateInviteLinkInitialRole,
} from "../dao";

const ORG = "test_invite_link_org";
const ADMIN = "test_invite_link_admin";
const JOINER = "test_invite_link_joiner";

async function clean() {
  await db.delete(workspaceInviteLink).where(eq(workspaceInviteLink.organizationId, ORG));
  await db.delete(member).where(eq(member.organizationId, ORG));
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(user).where(eq(user.id, ADMIN));
  await db.delete(user).where(eq(user.id, JOINER));
}

describe("invite-links dao", () => {
  beforeAll(async () => {
    await clean();
  });

  beforeEach(async () => {
    await db.insert(user).values([
      {
        createdAt: new Date(),
        email: "admin@invite-links-test.local",
        emailVerified: true,
        id: ADMIN,
        name: "Admin",
        updatedAt: new Date(),
      },
      {
        createdAt: new Date(),
        email: "joiner@invite-links-test.local",
        emailVerified: true,
        id: JOINER,
        name: "Joiner",
        updatedAt: new Date(),
      },
    ]);
    await db.insert(organization).values({
      createdAt: new Date(),
      id: ORG,
      name: "Test Org",
      slug: "test-invite-org",
    });
    await db.insert(member).values({
      createdAt: new Date(),
      id: "m_admin",
      organizationId: ORG,
      role: "owner",
      userId: ADMIN,
    });
  });

  afterEach(clean);

  it("creates a link with a 16-char base62 code", async () => {
    const link = await createInviteLink({ createdBy: ADMIN, organizationId: ORG });
    expect(link.code).toMatch(/^[0-9A-Za-z]{16}$/);
    expect(link.disabledAt).toBeNull();
    expect(link.initialRole).toBe("noAccess");
    expect(link.organizationId).toBe(ORG);
  });

  it("creates a link with the requested initial role", async () => {
    const link = await createInviteLink({
      createdBy: ADMIN,
      initialRole: "member",
      organizationId: ORG,
    });
    expect(link.initialRole).toBe("member");
  });

  it("finds active link by code, returns null for disabled", async () => {
    const link = await createInviteLink({ createdBy: ADMIN, organizationId: ORG });
    const hit = await findActiveLinkByCode(link.code);
    expect(hit?.id).toBe(link.id);
    await disableInviteLink({ disabledBy: ADMIN, id: link.id, organizationId: ORG });
    expect(await findActiveLinkByCode(link.code)).toBeNull();
  });

  it("disable is idempotent — second call doesn't change disabledAt", async () => {
    const link = await createInviteLink({ createdBy: ADMIN, organizationId: ORG });
    const first = await disableInviteLink({ disabledBy: ADMIN, id: link.id, organizationId: ORG });
    const second = await disableInviteLink({ disabledBy: ADMIN, id: link.id, organizationId: ORG });
    expect(first?.disabledAt?.getTime()).toBe(second?.disabledAt?.getTime());
  });

  it("enable clears disabledAt/disabledBy on a disabled link", async () => {
    const link = await createInviteLink({ createdBy: ADMIN, organizationId: ORG });
    await disableInviteLink({ disabledBy: ADMIN, id: link.id, organizationId: ORG });
    const enabled = await enableInviteLink({ id: link.id, organizationId: ORG });
    expect(enabled?.disabledAt).toBeNull();
    expect(enabled?.disabledBy).toBeNull();
    // 重新进入 active 名单
    const hit = await findActiveLinkByCode(link.code);
    expect(hit?.id).toBe(link.id);
  });

  it("enable is idempotent on an already-active link", async () => {
    const link = await createInviteLink({ createdBy: ADMIN, organizationId: ORG });
    const result = await enableInviteLink({ id: link.id, organizationId: ORG });
    expect(result?.id).toBe(link.id);
    expect(result?.disabledAt).toBeNull();
  });

  it("listInviteLinks returns joinedCount", async () => {
    const link = await createInviteLink({ createdBy: ADMIN, organizationId: ORG });
    await db.insert(member).values({
      createdAt: new Date(),
      id: "m_joiner",
      inviteLinkId: link.id,
      organizationId: ORG,
      role: "member",
      userId: JOINER,
    });
    const list = await listInviteLinks(ORG);
    expect(list).toHaveLength(1);
    expect(list[0]?.joinedCount).toBe(1);
    expect(list[0]?.initialRole).toBe("noAccess");
  });

  it("updates only the initial role for a link in the current organization", async () => {
    const link = await createInviteLink({ createdBy: ADMIN, organizationId: ORG });
    const updated = await updateInviteLinkInitialRole({
      id: link.id,
      initialRole: "member",
      organizationId: ORG,
    });
    expect(updated?.id).toBe(link.id);
    expect(updated?.initialRole).toBe("member");
    expect(updated?.code).toBe(link.code);
  });

  it("listLinkMembers returns joined users", async () => {
    const link = await createInviteLink({ createdBy: ADMIN, organizationId: ORG });
    await db.insert(member).values({
      createdAt: new Date(),
      id: "m_joiner",
      inviteLinkId: link.id,
      organizationId: ORG,
      role: "member",
      userId: JOINER,
    });
    const rows = await listLinkMembers({ id: link.id, organizationId: ORG });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("joiner@invite-links-test.local");
  });
});
