// 中文：通过 account 表反查 Feishu open_id → userId 的绑定 gate 测试
// English: tests for the OAuth binding gate that maps Feishu open_id → userId
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { account, user } from "@/lib/db/schema";
import { requireBinding } from "../identity/require-binding";

const USER_ID = "test-user-rb";
const OPEN_ID = "ou_test_rb_001";
const ACCOUNT_ID_FEISHU = "acc-feishu-rb";

async function seed() {
  await db
    .insert(user)
    .values({
      email: `${USER_ID}@test.local`,
      id: USER_ID,
      name: "RB Test",
    })
    .onConflictDoNothing();
  await db
    .insert(account)
    .values({
      accountId: OPEN_ID,
      id: ACCOUNT_ID_FEISHU,
      providerId: "feishu",
      updatedAt: new Date(),
      userId: USER_ID,
    })
    .onConflictDoNothing();
}

async function cleanup() {
  await db.delete(account).where(eq(account.id, ACCOUNT_ID_FEISHU));
  await db.delete(account).where(eq(account.id, "acc-feishu-jiguang-rb"));
  await db.delete(user).where(eq(user.id, USER_ID));
}

describe("identity/require-binding", () => {
  beforeEach(async () => {
    await cleanup();
    await seed();
  });
  afterAll(cleanup);

  it("returns userId for a bound feishu open_id", async () => {
    const result = await requireBinding(OPEN_ID);
    expect(result).toEqual({ userId: USER_ID });
  });

  it("returns unbound for an unknown open_id", async () => {
    const result = await requireBinding("ou_does_not_exist");
    expect(result).toEqual({ unbound: true });
  });

  it("matches both feishu and feishu-jiguang providers by default", async () => {
    await db
      .insert(account)
      .values({
        accountId: "ou_jiguang_rb_001",
        id: "acc-feishu-jiguang-rb",
        providerId: "feishu-jiguang",
        updatedAt: new Date(),
        userId: USER_ID,
      })
      .onConflictDoNothing();

    const result = await requireBinding("ou_jiguang_rb_001");
    expect(result).toEqual({ userId: USER_ID });
  });
});
