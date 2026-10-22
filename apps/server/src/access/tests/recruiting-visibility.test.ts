import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../infrastructure/db/index";
import { member, organization, user } from "@app/db-schema/schema";
import {
  intersectRequestedCreatorIds,
  resolveRecruitingVisibilityScope,
} from "@app/resume-processing/review/support/access-recruiting-visibility";

const ORG = "test_org_recruiting_visibility";
const OTHER_ORG = "test_org_recruiting_visibility_other";
const NOW = new Date("2026-06-10T10:00:00.000Z");

const USERS = {
  admin: "test_vis_admin",
  member: "test_vis_member",
  noAccess: "test_vis_no_access",
  owner: "test_vis_owner",
} as const;

async function cleanup() {
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
    { createdAt: NOW, id: "m_vis_owner", organizationId: ORG, role: "owner", userId: USERS.owner },
    { createdAt: NOW, id: "m_vis_admin", organizationId: ORG, role: "admin", userId: USERS.admin },
    {
      createdAt: NOW,
      id: "m_vis_member",
      organizationId: ORG,
      role: "member",
      userId: USERS.member,
    },
    {
      createdAt: NOW,
      id: "m_vis_no_access",
      organizationId: ORG,
      role: "noAccess",
      userId: USERS.noAccess,
    },
  ]);
});

afterAll(cleanup);

describe("resolveRecruitingVisibilityScope", () => {
  it.each([USERS.owner, USERS.admin, USERS.member])(
    "lets workspace member %s see all recruiting data in the workspace",
    async (userId) => {
      await expect(
        resolveRecruitingVisibilityScope({ organizationId: ORG, userId }),
      ).resolves.toEqual({ kind: "all" });
    },
  );

  it("trusts the request-scoped owner role resolved by workspace middleware", async () => {
    await expect(
      resolveRecruitingVisibilityScope({
        currentRole: "owner",
        organizationId: OTHER_ORG,
        userId: USERS.member,
      }),
    ).resolves.toEqual({ kind: "all" });
  });

  it("returns none for no-access members", async () => {
    await expect(
      resolveRecruitingVisibilityScope({ organizationId: ORG, userId: USERS.noAccess }),
    ).resolves.toEqual({ kind: "none" });
  });

  it("returns none when the user is not a member of the workspace", async () => {
    await expect(
      resolveRecruitingVisibilityScope({ organizationId: OTHER_ORG, userId: USERS.member }),
    ).resolves.toEqual({ kind: "none" });
  });

  it("treats blank creator filters as no filter for all-data scopes", () => {
    expect(intersectRequestedCreatorIds([], { kind: "all" })).toBeNull();
    expect(intersectRequestedCreatorIds([""], { kind: "all" })).toBeNull();
    expect(intersectRequestedCreatorIds([USERS.member], { kind: "all" })).toEqual([USERS.member]);
  });
});
