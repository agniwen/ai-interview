// 中文：activate-jd action handler 集成测试
// English: integration test for the activate-jd action handler
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { account, department, feishuThreadState, jobDescription, user } from "@/lib/db/schema";
import { handleActivateJd } from "../actions/activate-jd";

const USER_ID = "test-user-act-jd";
const OPEN_ID = "ou_act_jd_001";
const ACCT_ID = "acc-feishu-act-jd";
const DEPT_ID = "test-dept-act-jd";
const JD_ID = "test-jd-act-jd";
const THREAD = "feishu:test:dm:act-jd";

async function seed() {
  await db
    .insert(user)
    .values({ email: `${USER_ID}@test.local`, id: USER_ID, name: "Act JD" })
    .onConflictDoNothing();
  await db
    .insert(account)
    .values({
      accountId: OPEN_ID,
      id: ACCT_ID,
      providerId: "feishu",
      updatedAt: new Date(),
      userId: USER_ID,
    })
    .onConflictDoNothing();
  await db.insert(department).values({ id: DEPT_ID, name: "Eng" }).onConflictDoNothing();
  await db
    .insert(jobDescription)
    .values({ departmentId: DEPT_ID, id: JD_ID, name: "前端工程师", prompt: "test" })
    .onConflictDoNothing();
}

async function cleanup() {
  await db.delete(feishuThreadState).where(eq(feishuThreadState.threadId, THREAD));
  await db.delete(jobDescription).where(eq(jobDescription.id, JD_ID));
  await db.delete(department).where(eq(department.id, DEPT_ID));
  await db.delete(account).where(eq(account.id, ACCT_ID));
  await db.delete(user).where(eq(user.id, USER_ID));
}

function makeEvent(opts: { value: string; openId: string; threadId: string }) {
  const post = vi.fn(async () => {});
  return {
    event: {
      actionId: "activate-jd",
      messageId: "m-1",
      thread: { id: opts.threadId, post } as never,
      threadId: opts.threadId,
      user: { userId: opts.openId, userName: "tester" } as never,
      value: opts.value,
    },
    post,
  };
}

describe("handleActivateJd", () => {
  beforeEach(async () => {
    await cleanup();
    await seed();
  });
  afterAll(cleanup);

  it("activates the JD for a bound HR and posts confirmation", async () => {
    const { event, post } = makeEvent({ openId: OPEN_ID, threadId: THREAD, value: JD_ID });
    await handleActivateJd(event as never);

    const [row] = await db
      .select({ activeJdId: feishuThreadState.activeJdId })
      .from(feishuThreadState)
      .where(eq(feishuThreadState.threadId, THREAD));
    expect(row?.activeJdId).toBe(JD_ID);
    expect(post).toHaveBeenCalledOnce();
    const cardArg = JSON.stringify(post.mock.calls[0][0]);
    expect(cardArg).toContain("前端工程师");
  });

  it("posts OAuth card and does NOT activate when sender is unbound", async () => {
    const { event, post } = makeEvent({ openId: "ou_unknown", threadId: THREAD, value: JD_ID });
    await handleActivateJd(event as never);

    const [row] = await db
      .select({ activeJdId: feishuThreadState.activeJdId })
      .from(feishuThreadState)
      .where(eq(feishuThreadState.threadId, THREAD));
    expect(row).toBeUndefined();
    expect(post).toHaveBeenCalledOnce();
    const cardArg = JSON.stringify(post.mock.calls[0][0]);
    expect(cardArg).toContain("首次使用");
  });

  it("ignores when JD id does not exist", async () => {
    const { event, post } = makeEvent({
      openId: OPEN_ID,
      threadId: THREAD,
      value: "nonexistent-jd",
    });
    await handleActivateJd(event as never);
    const [row] = await db
      .select({ activeJdId: feishuThreadState.activeJdId })
      .from(feishuThreadState)
      .where(eq(feishuThreadState.threadId, THREAD));
    expect(row).toBeUndefined();
    expect(post).toHaveBeenCalledOnce();
    const cardArg = JSON.stringify(post.mock.calls[0][0]);
    expect(cardArg).toContain("已失效");
  });
});
