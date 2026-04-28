// 中文：feishu_thread_state 的 CRUD 集成测试，依赖本地数据库连接
// English: integration test for feishu_thread_state CRUD, requires local DB
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { department, feishuThreadState, jobDescription, user } from "@/lib/db/schema";
import { clearActiveJd, getActiveJd, setActiveJd } from "../session/active-jd";

const THREAD = "test-thread-active-jd";
const USER_ID = "test-user-active-jd";
const DEPT_ID = "test-dept-active-jd";
const JD_ID = "test-jd-active-jd";

async function seed() {
  await db
    .insert(user)
    .values({
      email: `${USER_ID}@test.local`,
      id: USER_ID,
      name: "Test User",
    })
    .onConflictDoNothing();
  await db
    .insert(department)
    .values({
      id: DEPT_ID,
      name: "Test Dept",
    })
    .onConflictDoNothing();
  await db
    .insert(jobDescription)
    .values({
      departmentId: DEPT_ID,
      id: JD_ID,
      name: "Test JD",
      prompt: "test prompt",
    })
    .onConflictDoNothing();
}

async function cleanup() {
  await db.delete(feishuThreadState).where(eq(feishuThreadState.threadId, THREAD));
  await db.delete(jobDescription).where(eq(jobDescription.id, JD_ID));
  await db.delete(department).where(eq(department.id, DEPT_ID));
  await db.delete(user).where(eq(user.id, USER_ID));
}

describe("session/active-jd", () => {
  beforeEach(async () => {
    await cleanup();
    await seed();
  });
  afterAll(cleanup);

  it("returns null for unknown thread", async () => {
    expect(await getActiveJd(THREAD)).toBeNull();
  });

  it("upserts active JD on first set, then updates on second set", async () => {
    await setActiveJd(THREAD, JD_ID);
    expect(await getActiveJd(THREAD)).toBe(JD_ID);
    await setActiveJd(THREAD, JD_ID);
    expect(await getActiveJd(THREAD)).toBe(JD_ID);
  });

  it("clearActiveJd nulls the column without deleting the row", async () => {
    await setActiveJd(THREAD, JD_ID);
    await clearActiveJd(THREAD);
    expect(await getActiveJd(THREAD)).toBeNull();
  });

  it("returns null when JD is deleted (FK set null)", async () => {
    await setActiveJd(THREAD, JD_ID);
    await db.delete(jobDescription).where(eq(jobDescription.id, JD_ID));
    expect(await getActiveJd(THREAD)).toBeNull();
  });
});
