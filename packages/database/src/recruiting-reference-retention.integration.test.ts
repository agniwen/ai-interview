import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  organization,
  studioInterview,
  user,
  jobDescription,
  department,
} from "@app/db-schema/schema";
import { createDatabase } from "./index";
import { createRecruitingRecords } from "./recruiting-records";
import {
  hasRecruitingReferences,
  assertNoRecruitingReferences,
  RecruitingReferenceRetentionError,
} from "./recruiting-reference-retention";

const url = process.env.RECRUITING_TEST_DATABASE_URL;
if (url && !new URL(url).pathname.includes("_test_")) {
  throw new Error("引用检查测试仅可在隔离测试库执行");
}
describe.skipIf(!url)("当前招聘引用检查", () => {
  const client = postgres(url ?? "postgres://localhost/unused", { max: 1 });
  const db = createDatabase(client);
  afterAll(() => client.end());
  it("只有旧档案时可删除工作区且旧行保持原样", async () => {
    const rollback = new Error("rollback archived parent deletion");
    await expect(
      db.transaction(async (tx) => {
        const id = crypto.randomUUID();
        await tx.insert(organization).values({ id, name: "旧档案工作区", slug: id });
        await tx
          .insert(studioInterview)
          .values({ candidateName: "独立归档", id, organizationId: id });
        const [before] = await tx.select().from(studioInterview).where(eq(studioInterview.id, id));
        await assertNoRecruitingReferences(tx, "organization", id);
        await tx.delete(organization).where(eq(organization.id, id));
        const [after] = await tx.select().from(studioInterview).where(eq(studioInterview.id, id));
        expect(after).toEqual(before);
        expect(await tx.select().from(organization).where(eq(organization.id, id))).toHaveLength(0);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it("仅旧档案不拦截，新增招聘记录才拦截工作区、用户和岗位", async () => {
    const rollback = new Error("rollback reference fixture");
    await expect(
      db.transaction(async (tx) => {
        const id = crypto.randomUUID();
        await tx.insert(organization).values({ id, name: "引用测试", slug: id });
        await tx.insert(user).values({ email: `${id}@example.test`, id, name: "负责人" });
        await tx.insert(department).values({ id, name: "测试部门", organizationId: id });
        await tx
          .insert(jobDescription)
          .values({ departmentId: id, id, name: "测试岗位", organizationId: id, prompt: "JD" });
        const parents = ["organization", "user", "job_description"];
        for (const parent of parents) {
          expect(await hasRecruitingReferences(tx, parent, id)).toBe(false);
        }
        await tx.insert(studioInterview).values({
          candidateName: "旧档案",
          createdBy: id,
          id,
          jobDescriptionId: id,
          organizationId: id,
        });
        const [before] = await tx.select().from(studioInterview).where(eq(studioInterview.id, id));
        for (const parent of parents) {
          expect(await hasRecruitingReferences(tx, parent, id)).toBe(false);
          await assertNoRecruitingReferences(tx, parent, id);
        }
        await createRecruitingRecords(tx, {
          candidateName: "当前候选人",
          createdBy: id,
          jobDescriptionId: id,
          organizationId: id,
        });
        for (const parent of parents) {
          expect(await hasRecruitingReferences(tx, parent, id)).toBe(true);
          await expect(assertNoRecruitingReferences(tx, parent, id)).rejects.toBeInstanceOf(
            RecruitingReferenceRetentionError,
          );
        }
        const [after] = await tx.select().from(studioInterview).where(eq(studioInterview.id, id));
        expect(after).toEqual(before);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
