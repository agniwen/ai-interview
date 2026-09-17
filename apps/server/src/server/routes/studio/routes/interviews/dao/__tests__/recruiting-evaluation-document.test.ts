import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createRecruitingRecords } from "@app/database/recruiting-records";
import { account, user, organization, recruitingEvaluationDocument } from "@app/db-schema/schema";
import { db } from "../../../../../../../lib/server/db/index";
import { ensureRecordEvaluationDocument } from "../../application/default-ensure-recruiting-evaluation-document";
import { ensureHumanEvaluationDocument } from "../../application/ensure-human-evaluation-document";
import type { createFeishuInterviewEvaluationDocx } from "../../../../../../integrations/feishu/feishu-docx";

const createDocument = vi.fn<typeof createFeishuInterviewEvaluationDocx>();
const dependencies = {
  createDocument,
  validateProvider: () => ({ appId: "test", appSecret: "test" }),
};
const ensureDocument = (input: Parameters<typeof ensureRecordEvaluationDocument>[0]) =>
  ensureRecordEvaluationDocument(input, dependencies);
const humanDependencies = { ensureDocument, grantAccess: vi.fn(() => Promise.resolve()) };
const org = `record-doc-${crypto.randomUUID()}`;
let serial = 0;
async function fixture() {
  serial += 1;
  const id = `${org}-${serial}`;
  await createRecruitingRecords(db, {
    candidateName: "隔离测试",
    id,
    interviewQuestions: [],
    organizationId: org,
  });
  return {
    build: vi.fn(() =>
      Promise.resolve({ blocks: [], recipientOpenId: "test-open", title: "候选人评价表" }),
    ),
    organizationId: org,
    providerId: "feishu" as const,
    recruitingRecordId: id,
  };
}
beforeAll(async () => {
  await db
    .insert(organization)
    .values({ createdAt: new Date(), id: org, name: "隔离测试", slug: org });
  await db
    .insert(user)
    .values({ email: `${org}@example.test`, emailVerified: false, id: org, name: "测试面试官" });
  await db.insert(account).values({
    accountId: "test-open",
    createdAt: new Date(),
    id: org,
    issuer: "test-feishu",
    providerId: "feishu",
    updatedAt: new Date(),
    userId: org,
  });
});
afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, org));
  await db.delete(user).where(eq(user.id, org));
});

describe("shared recruiting document persistence", () => {
  it("the production human path builds the candidate form without an AI conversation or notification", async () => {
    const input = await fixture();
    const create = createDocument.mockReset().mockImplementation(async (_provider, options) => {
      expect(options.title).toContain("隔离测试");
      expect(JSON.stringify(options.blocks)).toContain("业务一面");
      await options.onDocumentCreated?.("human-first");
      return { documentId: "human-first", documentUrl: "https://feishu.cn/docx/human-first" };
    });
    const job = {
      ...input,
      attemptCount: 1,
      blockId: null,
      deadlineAt: Date.now() + 300_000,
      documentId: null,
      documentUrl: null,
      evaluation: {
        detailedAnalysis: "分析",
        evidenceTurnIds: [],
        overallEvaluation: "评价",
        professionalSkill: "优",
        rating: "A" as const,
        risks: "风险",
        rolePosition: "执行",
        salaryRecommendation: "",
        seniorityPosition: "高级",
        strengths: "优势",
      },
      leaseOwner: "test",
      outcome: "pass" as const,
      providerId: null,
      roundId: "round",
      roundLabel: "业务一面",
      snapshotId: "snapshot",
      submittedAt: new Date().toISOString(),
      submittedBy: "测试面试官",
      submittedByUserId: org,
    };
    const first = await ensureHumanEvaluationDocument(job, humanDependencies);
    const second = await ensureHumanEvaluationDocument(
      { ...job, roundId: "final-round" },
      humanDependencies,
    );
    expect(first.documentId).toBe("human-first");
    expect(second.documentId).toBe(first.documentId);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("serializes two first submissions across callers and creates only once", async () => {
    const input = await fixture();
    const create = createDocument.mockReset();
    create.mockImplementation(async (_provider, options) => {
      await options.onDocumentCreated?.("one-document");
      return { documentId: "one-document", documentUrl: "https://feishu.cn/docx/one-document" };
    });
    const [first, second] = await Promise.all([ensureDocument(input), ensureDocument(input)]);
    expect(first).toEqual(second);
    expect(create).toHaveBeenCalledTimes(1);
    expect(input.build).toHaveBeenCalledTimes(1);
  });
  it("resumes the checkpointed document with frozen content after partial initialization fails", async () => {
    const input = await fixture();
    const create = createDocument.mockReset();
    create.mockImplementationOnce(async (_provider, options) => {
      await options.onDocumentCreated?.("partial");
      throw new Error("body write failed");
    });
    await expect(ensureDocument(input)).rejects.toThrow("body write failed");
    create.mockImplementationOnce((_provider, options) => {
      expect(options.existingDocumentId).toBe("partial");
      expect(options.initializationKey).toContain(input.recruitingRecordId);
      return Promise.resolve({
        documentId: "partial",
        documentUrl: "https://feishu.cn/docx/partial",
      });
    });
    await expect(ensureDocument(input)).resolves.toMatchObject({
      documentId: "partial",
    });
    expect(input.build).toHaveBeenCalledTimes(1);
    const [saved] = await db
      .select()
      .from(recruitingEvaluationDocument)
      .where(eq(recruitingEvaluationDocument.recruitingRecordId, input.recruitingRecordId));
    expect(saved).toMatchObject({ initialization: null, status: "ready" });
  });
  it("does not recreate after an unknown external create result", async () => {
    const input = await fixture();
    const create = createDocument.mockReset().mockRejectedValue(new Error("connection lost"));
    await expect(ensureDocument(input)).rejects.toThrow("connection lost");
    await expect(ensureDocument(input)).rejects.toThrow("创建结果未知");
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("rejects a record from another workspace before creating anything", async () => {
    const input = await fixture();
    await expect(ensureDocument({ ...input, organizationId: "other" })).rejects.toThrow(
      "不属于当前工作区",
    );
    expect(input.build).not.toHaveBeenCalled();
  });
});
