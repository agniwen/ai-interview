// 批量简历上传 processor 集成测试 —— 真实 PG，mock S3 和简历解析器。
// Integration tests for the bulk-upload processor — real Postgres, mocked S3 + parser.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@app/server/lib/server/db";
import {
  member,
  department,
  jobDescription,
  organization,
  resumePoolItem,
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import {
  cancelBatch,
  insertBatchWithItems,
} from "@app/server/server/routes/studio/routes/resume-upload-batches/dao/batches";
import {
  getClaimMissRetryError,
  createResumeUploadBatchProcessor,
} from "@app/server/server/routes/studio/routes/resume-upload-batches/utils/processor";
import type { ResumeUploadBatchProcessorDependencies } from "@app/server/server/routes/studio/routes/resume-upload-batches/utils/processor";
import { deleteFixtureResumePoolItems } from "../../../../../../test-utils/db-fixture-cleanup";

// Real DB round-trips routinely exceed the default 5s under parallel suite load.
vi.setConfig({ testTimeout: 30_000 });

const dependencies = {
  enqueueResumePoolReviewGenerationBestEffort:
    vi.fn<ResumeUploadBatchProcessorDependencies["enqueueResumePoolReviewGenerationBestEffort"]>(),
  enqueueResumeReviewGenerationForRecordBestEffort:
    vi.fn<
      ResumeUploadBatchProcessorDependencies["enqueueResumeReviewGenerationForRecordBestEffort"]
    >(),
  enqueueResumeSemanticIndexJobBestEffort:
    vi.fn<ResumeUploadBatchProcessorDependencies["enqueueResumeSemanticIndexJobBestEffort"]>(),
  findAttachmentByStorageKey:
    vi.fn<ResumeUploadBatchProcessorDependencies["findAttachmentByStorageKey"]>(),
  generateInterviewQuestionsForProfile:
    vi.fn<ResumeUploadBatchProcessorDependencies["generateInterviewQuestionsForProfile"]>(),
  getObjectStream: vi.fn<ResumeUploadBatchProcessorDependencies["getObjectStream"]>(),
  parseResumeBytesToProfile:
    vi.fn<ResumeUploadBatchProcessorDependencies["parseResumeBytesToProfile"]>(),
  projectAttachmentToResumeProfile:
    vi.fn<ResumeUploadBatchProcessorDependencies["projectAttachmentToResumeProfile"]>(),
  reassessResumeRecord: vi.fn<ResumeUploadBatchProcessorDependencies["reassessResumeRecord"]>(),
  resolveCandidateQuestionGenerationEnabled:
    vi.fn<ResumeUploadBatchProcessorDependencies["resolveCandidateQuestionGenerationEnabled"]>(),
  updateParseResultByHash:
    vi.fn<ResumeUploadBatchProcessorDependencies["updateParseResultByHash"]>(),
} satisfies ResumeUploadBatchProcessorDependencies;

const { processBatchItem, processNextItem } = createResumeUploadBatchProcessor(dependencies);

// ─── Fixture IDs（固定前缀避免与其他测试冲突）────────────────────────────────
// Fixed prefix to avoid collisions with other test runs.
const ORG_A = "bulk_proc_org_a";
const USER_A = "bulk_proc_user_a";
/** Suite-unique storage prefix so cleanup never leaves null-org pool orphans. */
const STORAGE_KEY_PREFIX = "storage/bulk-proc-test/";

const NOW = new Date("2026-05-18T10:00:00.000Z");
const GENERATED_QUESTIONS = Array.from({ length: 10 }, (_, index) => ({
  difficulty: "easy" as const,
  evaluationFocus: `考察重点 ${index + 1}`,
  followUpDirections: `追问方向 ${index + 1}`,
  order: index + 1,
  question: `面试题 ${index + 1}`,
}));
// ─── Mock helpers ─────────────────────────────────────────────────────────────

// 返回一个有效的 ReadableStream 响应体，模拟 S3 成功返回。
// Returns a valid ReadableStream body to simulate a successful S3 fetch.
function mockS3OK() {
  const stream = new Blob(["fake bytes"]).stream();
  // SAFETY: This test constructs the value with the asserted contract before this boundary.
  dependencies.getObjectStream.mockResolvedValue({
    body: stream,
    contentLength: 10,
    contentType: "application/pdf",
  });
}

// 模拟解析器成功返回指定 profile。
// Mocks the parser returning the given profile.
function mockParseOK(profile: {
  email: string | null;
  name: string;
  phone: string | null;
  targetRoles: string[];
}) {
  // SAFETY: This test constructs the value with the asserted contract before this boundary.
  dependencies.parseResumeBytesToProfile.mockResolvedValue({
    parsedPageCount: 1,
    parsedStructured: { profile } as never,
    parsedText: `${profile.name} OCR 原文`,
    parsedTextSource: "qwen-ocr",
    resumeProfile: profile as never,
  } as never);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// 构造最小化 files 入参。
// Build a minimal files array for insertBatchWithItems.
function makeFiles(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    contentHash: `${String(i + 1).repeat(64)}`,
    fileSize: 1024 * (i + 1),
    originalFileName: `resume_${i}.pdf`,
    storageKey: `${STORAGE_KEY_PREFIX}${crypto.randomUUID()}.pdf`,
  }));
}

async function expectQueuedPoolItem(poolItemId: string | null | undefined) {
  expect(poolItemId).toBeTruthy();
  const [queuedPoolItem] = await db
    .select()
    .from(resumePoolItem)
    .where(eq(resumePoolItem.id, poolItemId ?? ""));
  expect(queuedPoolItem?.candidateName).toBe("resume_0");
  expect(queuedPoolItem?.resumeParseStatus).toBe("queued");
  expect(queuedPoolItem?.resumeProfile).toBeNull();
}

async function createQueuedSingleItemBatch() {
  const batchId = await insertBatchWithItems({
    dedupPolicy: "skip",
    files: makeFiles(1),
    jdMode: "none",
    jobDescriptionId: null,
    organizationId: ORG_A,
    userId: USER_A,
  });

  const [item] = await db
    .select()
    .from(resumeUploadBatchItem)
    .where(eq(resumeUploadBatchItem.batchId, batchId));
  expect(item?.resumeRecordId).toBeTruthy();
  // SAFETY: This test constructs the value with the asserted contract before this boundary.
  const recordId = item?.resumeRecordId as string;
  const [record] = await db.select().from(studioInterview).where(eq(studioInterview.id, recordId));

  return { batchId, item, record, recordId };
}

// ─── 清理 ──────────────────────────────────────────────────────────────────────

// 测试中创建的 studio_interview 以及 batch rows 统一在 afterAll 清理。
// Cleans up all fixture data in FK-safe order.
async function cleanup() {
  // studio_interview FK refs resumeUploadBatchItem.resume_record_id → delete interview first.
  // 按 FK 顺序清理: interview → batch（items cascade）→ member → org → user
  const batches = await db
    .select({ id: resumeUploadBatch.id })
    .from(resumeUploadBatch)
    .where(eq(resumeUploadBatch.organizationId, ORG_A));

  // 先找所有 item 的 resumeRecordId，再删对应的 studio_interview。
  // Find all interview IDs created by these batches before deleting.
  for (const batch of batches) {
    const items = await db
      .select({ resumeRecordId: resumeUploadBatchItem.resumeRecordId })
      .from(resumeUploadBatchItem)
      .where(eq(resumeUploadBatchItem.batchId, batch.id));

    for (const item of items) {
      if (item.resumeRecordId) {
        await db.delete(studioInterview).where(eq(studioInterview.id, item.resumeRecordId));
      }
    }
  }

  // 直接清理 org 下的 studio_interview（含 dedup 测试中手动插入的行）。
  // Also clean any studio_interview rows directly under the org (e.g. pre-inserted dedup rows).
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_A));
  // Match pool rows by org/user/storage before deleting parents (SET NULL FKs).
  await deleteFixtureResumePoolItems({
    organizationIds: [ORG_A],
    storageKeyPrefixes: [STORAGE_KEY_PREFIX],
    userIds: [USER_A],
  });

  await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.organizationId, ORG_A));
  await db.delete(jobDescription).where(eq(jobDescription.organizationId, ORG_A));
  await db.delete(department).where(eq(department.organizationId, ORG_A));
  await db.delete(member).where(eq(member.userId, USER_A));
  await db.delete(organization).where(eq(organization.id, ORG_A));
  await db.delete(user).where(eq(user.id, USER_A));
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await cleanup();

  await db.insert(user).values({
    createdAt: NOW,
    email: "bulk-proc-a@example.com",
    emailVerified: false,
    id: USER_A,
    name: "bulk-proc-user-a",
    updatedAt: NOW,
  });

  await db.insert(organization).values({
    createdAt: NOW,
    id: ORG_A,
    name: "Bulk Proc Org A",
    slug: "bulk-proc-org-a",
  });

  await db.insert(member).values({
    createdAt: NOW,
    id: "bulk_proc_member_a",
    organizationId: ORG_A,
    role: "owner",
    userId: USER_A,
  });
});

afterAll(async () => {
  await cleanup();
});

beforeEach(() => {
  for (const dependency of Object.values(dependencies)) {
    dependency.mockReset();
  }
  dependencies.enqueueResumeSemanticIndexJobBestEffort.mockResolvedValue(true);
  dependencies.enqueueResumePoolReviewGenerationBestEffort.mockResolvedValue(true);
  dependencies.enqueueResumeReviewGenerationForRecordBestEffort.mockResolvedValue({
    status: "already_current",
  });
  // SAFETY: The fallback reassessment result is intentionally ignored by this processor test.
  dependencies.reassessResumeRecord.mockImplementation(() => Promise.resolve(undefined as never));
  dependencies.findAttachmentByStorageKey.mockResolvedValue(null);
  dependencies.generateInterviewQuestionsForProfile.mockResolvedValue(GENERATED_QUESTIONS);
  dependencies.projectAttachmentToResumeProfile.mockReturnValue(null);
  dependencies.resolveCandidateQuestionGenerationEnabled.mockReturnValue(true);
  dependencies.updateParseResultByHash.mockResolvedValue();
});

describe("getClaimMissRetryError", () => {
  it("pending item 或缺失 item 的 claim miss 必须让队列重试", () => {
    expect(
      getClaimMissRetryError(
        {
          batchId: "batch-1",
          startedAt: null,
          status: "pending",
        },
        "item-1",
      )?.message,
    ).toContain("item-1");

    expect(getClaimMissRetryError(null, "item-2")?.message).toContain("item-2");
  });

  it("terminal item 的 claim miss 允许作为幂等 no-op", () => {
    expect(
      getClaimMissRetryError(
        {
          batchId: "batch-1",
          startedAt: new Date("2026-05-18T10:00:00.000Z"),
          status: "succeeded",
        },
        "item-1",
      ),
    ).toBeNull();
  });
});

// ─── Test 1: happy path ───────────────────────────────────────────────────────

describe("processNextItem — happy path", () => {
  it.each([
    {
      cacheCase: "a different filename",
      parsedStructured: { name: "错误姓名", sourceFileName: "另一个文件名.pdf" },
    },
    {
      cacheCase: "a legacy structure without filename provenance",
      parsedStructured: { name: "旧缓存姓名" },
    },
  ])("reparses a storage-key cache entry with $cacheCase", async ({ parsedStructured }) => {
    const { item } = await createQueuedSingleItemBatch();
    // SAFETY: This fixture supplies only the attachment fields read by the cache lookup path.
    dependencies.findAttachmentByStorageKey.mockResolvedValue({
      parsedStructured,
      parsedTextSource: "qwen-ocr",
    } as never);
    // SAFETY: The mismatch guard must prevent this deliberately partial profile from being read.
    dependencies.projectAttachmentToResumeProfile.mockReturnValue({ name: "错误姓名" } as never);
    mockS3OK();
    mockParseOK({
      email: null,
      name: "当前文件候选人",
      phone: null,
      targetRoles: [],
    });

    const result = await processBatchItem(item.id);

    expect(result?.item?.status).toBe("succeeded");
    expect(dependencies.projectAttachmentToResumeProfile).not.toHaveBeenCalled();
    expect(dependencies.parseResumeBytesToProfile).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: item.originalFileName }),
    );
  });

  it("pending item → succeeded，并更新批次创建时的未解析占位记录", async () => {
    // Happy path: single-item batch processes to succeeded and updates the queued placeholder record.
    const {
      item: beforeItem,
      record: beforeRecord,
      recordId,
    } = await createQueuedSingleItemBatch();
    expect(beforeRecord?.resumeParseStatus).toBe("queued");
    expect(beforeRecord?.resumeProfile).toBeNull();

    mockS3OK();
    mockParseOK({
      email: "test@example.com",
      name: "Test User",
      phone: "13800000000",
      targetRoles: ["Engineer"],
    });
    dependencies.generateInterviewQuestionsForProfile.mockImplementationOnce(async () => {
      const [recordDuringGeneration] = await db
        .select({ resumeParseStatus: studioInterview.resumeParseStatus })
        .from(studioInterview)
        .where(eq(studioInterview.id, recordId));
      expect(recordDuringGeneration?.resumeParseStatus).toBe("processing");
      return GENERATED_QUESTIONS;
    });

    const result = await processBatchItem(beforeItem.id);

    // 结果完整性断言 / Result assertions.
    expect(result).not.toBeNull();
    expect(result?.done).toBe(true);
    expect(result?.item).not.toBeNull();
    expect(result?.item?.status).toBe("succeeded");
    expect(result?.item?.resumeRecordId).toBe(recordId);

    // 验证 studio_interview 占位行已被更新，而不是新建另一行。
    // Verify the placeholder studio_interview row was updated instead of creating a second row.
    const [interview] = await db
      .select()
      .from(studioInterview)
      .where(eq(studioInterview.id, recordId));
    expect(interview).toBeDefined();
    if (!interview) {
      throw new Error("expected studio_interview row to exist");
    }
    expect(interview.organizationId).toBe(ORG_A);
    expect(interview.candidateEmail).toBe("test@example.com");
    expect(interview.candidateName).toBe("Test User");
    expect(interview.candidatePhone).toBe("13800000000");
    expect(interview.targetRole).toBe("Engineer");
    expect(interview.notes).toBeNull();
    expect(interview.resumeParseStatus).toBe("ready");
    expect(interview.resumeParsedAt).toBeTruthy();
    expect(interview.resumeText).toBe("Test User OCR 原文");
    expect(interview.interviewQuestions).toEqual(GENERATED_QUESTIONS);
    expect(dependencies.generateInterviewQuestionsForProfile).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Test User" }),
    );
    expect(
      dependencies.generateInterviewQuestionsForProfile.mock.invocationCallOrder[0],
    ).toBeLessThan(
      dependencies.enqueueResumeReviewGenerationForRecordBestEffort.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    );
    expect(dependencies.enqueueResumeReviewGenerationForRecordBestEffort).toHaveBeenCalledWith({
      autoMatchJobDescription: false,
      generationToken: beforeItem.id,
      jobDescriptionId: null,
      organizationId: ORG_A,
      resumeRecordId: recordId,
      source: "resume_upload",
    });
    expect(dependencies.enqueueResumeSemanticIndexJobBestEffort).toHaveBeenCalledWith({
      organizationId: ORG_A,
      sourceId: recordId,
      sourceType: "studio_interview",
    });

    // 验证 batch 计数器更新正确。
    // Verify batch counters are updated correctly.
    expect(result?.batch.processedCount).toBe(1);
    expect(result?.batch.succeededCount).toBe(1);
    expect(result?.batch.status).toBe("completed");
  });

  it("面试题生成失败时仍完成简历解析，并保留空题目供发起时兜底", async () => {
    const { item, recordId } = await createQueuedSingleItemBatch();
    mockS3OK();
    mockParseOK({
      email: "question-fallback@example.com",
      name: "Question Fallback",
      phone: null,
      targetRoles: ["Engineer"],
    });
    dependencies.generateInterviewQuestionsForProfile.mockRejectedValueOnce(
      new Error("question generation unavailable"),
    );

    const result = await processBatchItem(item.id);

    expect(result?.item?.status).toBe("succeeded");
    const [interview] = await db
      .select({
        interviewQuestions: studioInterview.interviewQuestions,
        resumeParseStatus: studioInterview.resumeParseStatus,
      })
      .from(studioInterview)
      .where(eq(studioInterview.id, recordId));
    expect(interview?.resumeParseStatus).toBe("ready");
    expect(interview?.interviewQuestions).toEqual([]);
  });

  it("异步生成期间已有题目写入时不覆盖较新的题目", async () => {
    const { item, recordId } = await createQueuedSingleItemBatch();
    const manuallySavedQuestions = [
      {
        difficulty: "medium" as const,
        evaluationFocus: "手动保存的考察重点",
        followUpDirections: "手动保存的追问方向",
        order: 1,
        question: "手动保存的问题",
      },
    ];
    mockS3OK();
    mockParseOK({
      email: "question-race@example.com",
      name: "Question Race",
      phone: null,
      targetRoles: ["Engineer"],
    });
    dependencies.generateInterviewQuestionsForProfile.mockImplementationOnce(async () => {
      await db
        .update(studioInterview)
        .set({ interviewQuestions: manuallySavedQuestions })
        .where(eq(studioInterview.id, recordId));
      return GENERATED_QUESTIONS;
    });

    const result = await processBatchItem(item.id);

    expect(result?.item?.status).toBe("succeeded");
    const [interview] = await db
      .select({ interviewQuestions: studioInterview.interviewQuestions })
      .from(studioInterview)
      .where(eq(studioInterview.id, recordId));
    expect(interview?.interviewQuestions).toEqual(manuallySavedQuestions);
  });
});

describe("processNextItem — cancellation race", () => {
  it("解析中被取消后不再写入 succeeded 或触发 embedding", async () => {
    const { batchId, item, recordId } = await createQueuedSingleItemBatch();

    mockS3OK();
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    dependencies.parseResumeBytesToProfile.mockImplementation(async () => {
      const cancelled = await cancelBatch(batchId, ORG_A, USER_A);
      expect(cancelled).toBe(true);
      // SAFETY: This fake parser result supplies only the fields used by the processor path.
      return {
        parsedPageCount: 1,
        // SAFETY: This fake parser result uses a minimal structured payload for persistence assertions.
        parsedStructured: { name: "Cancelled User" } as never,
        parsedText: "Cancelled User OCR 原文",
        parsedTextSource: "qwen-ocr",
        // SAFETY: This fake parser result uses a minimal profile for persistence assertions.
        resumeProfile: {
          email: "cancelled@example.com",
          name: "Cancelled User",
          phone: null,
          targetRoles: ["Engineer"],
        } as never,
      } as never;
    });

    const result = await processBatchItem(item.id);

    expect(result?.batch.status).toBe("cancelled");
    expect(result?.done).toBe(true);
    expect(result?.item?.status).toBe("cancelled");
    expect(result?.item?.resumeRecordId).toBeNull();
    expect(dependencies.enqueueResumeSemanticIndexJobBestEffort).not.toHaveBeenCalled();

    const records = await db.select().from(studioInterview).where(eq(studioInterview.id, recordId));
    expect(records).toHaveLength(0);
  });
});

describe("processNextItem — resume pool target", () => {
  it("target=resume_pool + 绑定 JD → 先可查看，再异步生成岗位评价", async () => {
    const departmentId = `bulk_proc_dept_${crypto.randomUUID()}`;
    const jobDescriptionId = `bulk_proc_jd_${crypto.randomUUID()}`;
    await db.insert(department).values({
      createdAt: NOW,
      createdBy: USER_A,
      id: departmentId,
      name: "运维部",
      organizationId: ORG_A,
      updatedAt: NOW,
    });
    await db.insert(jobDescription).values({
      createdAt: NOW,
      createdBy: USER_A,
      departmentId,
      description: "负责基础设施稳定性和运维体系建设",
      id: jobDescriptionId,
      name: "运维总监",
      organizationId: ORG_A,
      prompt: "重点评估大规模运维、团队管理、稳定性治理经验",
      updatedAt: NOW,
    });
    const batchId = await insertBatchWithItems({
      dedupPolicy: "create",
      files: makeFiles(1),
      jdMode: "bind",
      jobDescriptionId,
      organizationId: ORG_A,
      resumePoolScope: "private",
      target: "resume_pool",
      userId: USER_A,
    });

    const [beforeItem] = await db
      .select()
      .from(resumeUploadBatchItem)
      .where(eq(resumeUploadBatchItem.batchId, batchId));
    await expectQueuedPoolItem(beforeItem?.poolItemId);

    mockS3OK();
    mockParseOK({
      email: "ops@example.com",
      name: "Ops User",
      phone: "13900000002",
      targetRoles: ["运维总监"],
    });

    const result = await processNextItem(batchId, ORG_A, USER_A);

    expect(result?.item?.status).toBe("succeeded");
    expect(dependencies.enqueueResumePoolReviewGenerationBestEffort).toHaveBeenCalledWith({
      autoMatchJobDescription: false,
      generationToken: beforeItem?.id,
      jobDescriptionId,
      organizationId: ORG_A,
      poolItemId: beforeItem?.poolItemId,
    });

    const [poolItem] = await db
      .select()
      .from(resumePoolItem)
      .where(eq(resumePoolItem.id, beforeItem?.poolItemId ?? ""));
    expect(poolItem?.jobDescriptionId).toBe(jobDescriptionId);
    expect(poolItem?.notes).toBeNull();
    expect(poolItem?.resumeParseStatus).toBe("ready");
  });

  it("jdMode=auto 时先发布结构化详情，再由评价任务匹配岗位", async () => {
    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(1),
      jdMode: "auto",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });
    const [beforeItem] = await db
      .select()
      .from(resumeUploadBatchItem)
      .where(eq(resumeUploadBatchItem.batchId, batchId));
    mockS3OK();
    mockParseOK({
      email: "auto-jd@example.com",
      name: "Auto JD User",
      phone: null,
      targetRoles: ["Engineer"],
    });

    const result = await processNextItem(batchId, ORG_A, USER_A);

    expect(result?.item?.status).toBe("succeeded");
    const [record] = await db
      .select()
      .from(studioInterview)
      .where(eq(studioInterview.id, beforeItem?.resumeRecordId ?? ""));
    expect(record?.resumeParseStatus).toBe("ready");
    expect(record?.jobDescriptionId).toBeNull();
    expect(dependencies.enqueueResumeReviewGenerationForRecordBestEffort).toHaveBeenCalledWith({
      autoMatchJobDescription: true,
      generationToken: beforeItem?.id,
      jobDescriptionId: null,
      organizationId: ORG_A,
      resumeRecordId: beforeItem?.resumeRecordId,
      source: "resume_upload",
    });
  });

  it("target=resume_pool → 创建简历池条目，不创建招聘台候选人记录", async () => {
    const batchId = await insertBatchWithItems({
      dedupPolicy: "create",
      files: makeFiles(1),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      resumePoolScope: "private",
      target: "resume_pool",
      userId: USER_A,
    });

    const [beforeItem] = await db
      .select()
      .from(resumeUploadBatchItem)
      .where(eq(resumeUploadBatchItem.batchId, batchId));
    expect(beforeItem?.resumeRecordId).toBeNull();
    await expectQueuedPoolItem(beforeItem?.poolItemId);
    const recordsBefore = await db
      .select()
      .from(studioInterview)
      .where(eq(studioInterview.organizationId, ORG_A));

    mockS3OK();
    mockParseOK({
      email: "pool@example.com",
      name: "Pool User",
      phone: "13900000000",
      targetRoles: ["Product Manager"],
    });

    const result = await processNextItem(batchId, ORG_A, USER_A);

    expect(result?.item?.status).toBe("succeeded");
    expect(result?.item?.resumeRecordId).toBeNull();
    expect(result?.item?.poolItemId).toBe(beforeItem?.poolItemId);
    expect(result?.batch.status).toBe("completed");

    const records = await db
      .select()
      .from(studioInterview)
      .where(eq(studioInterview.organizationId, ORG_A));
    expect(records).toHaveLength(recordsBefore.length);

    const poolItems = await db
      .select()
      .from(resumePoolItem)
      .where(eq(resumePoolItem.id, beforeItem?.poolItemId ?? ""));
    expect(poolItems).toHaveLength(1);
    expect(poolItems[0]?.scope).toBe("private");
    expect(poolItems[0]?.candidateName).toBe("Pool User");
    expect(poolItems[0]?.candidateEmail).toBe("pool@example.com");
    expect(poolItems[0]?.targetRole).toBe("Product Manager");
    expect(poolItems[0]?.resumeParseStatus).toBe("ready");
    expect(poolItems[0]?.resumeText).toBe("Pool User OCR 原文");
    expect(dependencies.enqueueResumeSemanticIndexJobBestEffort).toHaveBeenCalledWith({
      organizationId: ORG_A,
      sourceId: beforeItem?.poolItemId,
      sourceType: "resume_pool_item",
    });
    expect(dependencies.enqueueResumePoolReviewGenerationBestEffort).not.toHaveBeenCalled();
  });

  it("私有简历池 target=resume_pool + skip 时先入库并异步查重", async () => {
    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(1),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      resumePoolScope: "private",
      target: "resume_pool",
      userId: USER_A,
    });

    const [beforeItem] = await db
      .select()
      .from(resumeUploadBatchItem)
      .where(eq(resumeUploadBatchItem.batchId, batchId));
    await expectQueuedPoolItem(beforeItem?.poolItemId);

    mockS3OK();
    mockParseOK({
      email: "pool-dup@example.com",
      name: "Pool Dup User",
      phone: "13900000001",
      targetRoles: ["Product Manager"],
    });

    const result = await processNextItem(batchId, ORG_A, USER_A);

    expect(result?.item?.status).toBe("succeeded");
    expect(result?.item?.poolItemId).toBe(beforeItem?.poolItemId);
    expect(result?.batch.skippedCount).toBe(0);
    expect(dependencies.enqueueResumeSemanticIndexJobBestEffort).toHaveBeenCalledWith({
      organizationId: ORG_A,
      sourceId: beforeItem?.poolItemId,
      sourceType: "resume_pool_item",
    });

    const persistedPoolItems = await db
      .select()
      .from(resumePoolItem)
      .where(eq(resumePoolItem.id, beforeItem?.poolItemId ?? ""));
    expect(persistedPoolItems).toHaveLength(1);
  });
});

// ─── Test 2: parse failure ────────────────────────────────────────────────────

describe("processNextItem — parse failure", () => {
  it("解析失败 → item failed，batch counter +1，第二个 item 仍可成功完成批次", async () => {
    // Parse failure on first item → failed; batch counter bumped; second item succeeds.
    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(2),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });

    // 第一次调用：S3 OK，解析抛错。
    // First call: S3 OK, parser throws.
    mockS3OK();
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    dependencies.parseResumeBytesToProfile.mockRejectedValue(new Error("parse failed"));

    const result1 = await processNextItem(batchId, ORG_A, USER_A);

    expect(result1).not.toBeNull();
    expect(result1?.item?.status).toBe("failed");
    expect(result1?.item?.errorMessage).toBe("parse failed");
    expect(result1?.batch.failedCount).toBe(1);
    expect(result1?.batch.processedCount).toBe(1);
    // 还有一个 pending item，批次不应完成。
    // There's still a pending item — batch must not be done yet.
    expect(result1?.done).toBe(false);

    // 验证失败 item 保留批次创建时的占位记录，并标记为解析失败。
    // Verify the failed item keeps its queued placeholder record and marks it failed.
    expect(result1?.item?.resumeRecordId).toBeTruthy();
    const [failedRecord] = await db
      .select()
      .from(studioInterview)
      .where(eq(studioInterview.id, result1?.item?.resumeRecordId ?? ""));
    expect(failedRecord?.resumeParseStatus).toBe("failed");
    expect(failedRecord?.resumeParseError).toBe("parse failed");

    // 第二次调用：S3 OK，解析成功。
    // Second call: S3 OK, parser succeeds.
    mockS3OK();
    mockParseOK({
      email: "ok@example.com",
      name: "OK User",
      phone: null,
      targetRoles: [],
    });

    const result2 = await processNextItem(batchId, ORG_A, USER_A);

    expect(result2?.item?.status).toBe("succeeded");
    expect(result2?.batch.processedCount).toBe(2);
    expect(result2?.batch.status).toBe("completed");
  });
});

// ─── Test 3: dedup skip ───────────────────────────────────────────────────────
