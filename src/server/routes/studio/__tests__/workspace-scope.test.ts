// src/server/routes/studio/__tests__/workspace-scope.test.ts
//
// Regression smoke test: a drizzle `where(eq(table.organizationId, X))` lookup
// returns only rows belonging to X, never the sibling workspace. This locks in
// the basic isolation invariant that the full Hono pipeline depends on.

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { department, member, organization, user } from "@/lib/shared/db/schema";

const TEST_ORG_A = "test_org_scope_a";
const TEST_ORG_B = "test_org_scope_b";
const TEST_USER = "test_user_workspace_scope";

async function cleanup() {
  await db.delete(department).where(eq(department.name, "T:scope-test"));
  await db.delete(member).where(eq(member.userId, TEST_USER));
  await db.delete(organization).where(eq(organization.id, TEST_ORG_A));
  await db.delete(organization).where(eq(organization.id, TEST_ORG_B));
  await db.delete(user).where(eq(user.id, TEST_USER));
}

describe("workspace scope isolation", () => {
  beforeEach(async () => {
    await cleanup();
    await db.insert(user).values({
      createdAt: new Date(),
      email: "scope-test@example.com",
      emailVerified: false,
      id: TEST_USER,
      name: "scope-test",
      updatedAt: new Date(),
    });
    await db.insert(organization).values([
      {
        createdAt: new Date(),
        id: TEST_ORG_A,
        name: "Org A",
        slug: "test-scope-a",
      },
      {
        createdAt: new Date(),
        id: TEST_ORG_B,
        name: "Org B",
        slug: "test-scope-b",
      },
    ]);
    await db.insert(member).values([
      {
        createdAt: new Date(),
        id: "m_scope_a",
        organizationId: TEST_ORG_A,
        role: "owner",
        userId: TEST_USER,
      },
      {
        createdAt: new Date(),
        id: "m_scope_b",
        organizationId: TEST_ORG_B,
        role: "owner",
        userId: TEST_USER,
      },
    ]);
    await db.insert(department).values([
      {
        createdAt: new Date(),
        id: "dep_scope_a",
        name: "T:scope-test",
        organizationId: TEST_ORG_A,
        updatedAt: new Date(),
      },
      {
        createdAt: new Date(),
        id: "dep_scope_b",
        name: "T:scope-test",
        organizationId: TEST_ORG_B,
        updatedAt: new Date(),
      },
    ]);
  });

  afterEach(cleanup);

  it("scoped SELECT only returns rows for the active org", async () => {
    const rowsForA = await db
      .select()
      .from(department)
      .where(eq(department.organizationId, TEST_ORG_A));
    expect(rowsForA.map((r) => r.id)).toEqual(["dep_scope_a"]);

    const rowsForB = await db
      .select()
      .from(department)
      .where(eq(department.organizationId, TEST_ORG_B));
    expect(rowsForB.map((r) => r.id)).toEqual(["dep_scope_b"]);
  });
});
