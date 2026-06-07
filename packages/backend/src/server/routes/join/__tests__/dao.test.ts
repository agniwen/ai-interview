import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@arc/backend/lib/server/db";
import { member, organization, user, workspaceInviteLink } from "@arc/db-schema/schema";
import { acceptInviteLink, getJoinPreview } from "../dao";

const ORG = "test_join_org";
const OWNER = "test_join_owner";
const JOINER = "test_join_joiner";

async function clean() {
  await db.delete(member).where(eq(member.organizationId, ORG));
  await db.delete(workspaceInviteLink).where(eq(workspaceInviteLink.organizationId, ORG));
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(user).where(eq(user.id, OWNER));
  await db.delete(user).where(eq(user.id, JOINER));
}

async function seedLink(opts: { disabled?: boolean } = {}) {
  await db.insert(user).values([
    {
      createdAt: new Date(),
      email: "owner@test.local",
      emailVerified: true,
      id: OWNER,
      name: "Owner",
      updatedAt: new Date(),
    },
    {
      createdAt: new Date(),
      email: "joiner@test.local",
      emailVerified: true,
      id: JOINER,
      name: "Joiner",
      updatedAt: new Date(),
    },
  ]);
  await db.insert(organization).values({
    createdAt: new Date(),
    id: ORG,
    logo: null,
    name: "Test Org",
    slug: "test-join-org",
  });
  await db.insert(member).values({
    createdAt: new Date(),
    id: "m_owner",
    organizationId: ORG,
    role: "owner",
    userId: OWNER,
  });
  await db.insert(workspaceInviteLink).values({
    code: "TESTCODE12345678",
    createdBy: OWNER,
    disabledAt: opts.disabled ? new Date() : null,
    id: "wil_test",
    organizationId: ORG,
  });
}

describe("join dao", () => {
  beforeEach(clean);
  afterEach(clean);

  it("getJoinPreview returns valid + workspace info for active link", async () => {
    await seedLink();
    const preview = await getJoinPreview({ code: "TESTCODE12345678", userId: null });
    expect(preview.valid).toBe(true);
    expect(preview.workspace?.slug).toBe("test-join-org");
    expect(preview.alreadyMember).toBe(false);
  });

  it("getJoinPreview returns invalid for disabled link", async () => {
    await seedLink({ disabled: true });
    const preview = await getJoinPreview({ code: "TESTCODE12345678", userId: null });
    expect(preview.valid).toBe(false);
    expect(preview.workspace).toBeUndefined();
  });

  it("getJoinPreview returns alreadyMember=true for existing member", async () => {
    await seedLink();
    const preview = await getJoinPreview({ code: "TESTCODE12345678", userId: OWNER });
    expect(preview.valid).toBe(true);
    expect(preview.alreadyMember).toBe(true);
  });

  it("acceptInviteLink inserts member with role=hr and inviteLinkId", async () => {
    await seedLink();
    const result = await acceptInviteLink({ code: "TESTCODE12345678", userId: JOINER });
    expect(result.status).toBe("joined");
    expect(result.organizationId).toBe(ORG);
    const row = await db.query.member.findFirst({
      where: { organizationId: ORG, userId: JOINER },
    });
    expect(row?.role).toBe("hr");
    expect(row?.inviteLinkId).toBe("wil_test");
  });

  it("acceptInviteLink is idempotent for existing member", async () => {
    await seedLink();
    const first = await acceptInviteLink({ code: "TESTCODE12345678", userId: JOINER });
    const second = await acceptInviteLink({ code: "TESTCODE12345678", userId: JOINER });
    expect(first.status).toBe("joined");
    expect(second.status).toBe("already_member");
    expect(second.organizationId).toBe(ORG);
  });

  it("acceptInviteLink rejects disabled link", async () => {
    await seedLink({ disabled: true });
    await expect(
      acceptInviteLink({ code: "TESTCODE12345678", userId: JOINER }),
    ).rejects.toMatchObject({ code: "link_invalid" });
  });
});
