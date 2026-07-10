// 批量简历上传 processor 集成测试 —— 真实 PG，mock S3 和简历解析器。
// Integration tests for the bulk-upload processor — real Postgres, mocked S3 + parser.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import type * as S3Module from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import { getObjectStream } from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import type * as ResumeAgentModule from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import {
  generateResumeReview,
  generateResumeScreeningResult,
  parseResumeBytesToProfile,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import type * as DedupServiceModule from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/dedup-service";
import { findSemanticResumeDuplicates } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/dedup-service";
import { replaceDuplicateMatchesForSource } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/duplicate-matches";
import { enqueueResumeSemanticIndexJobBestEffort } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/enqueue";
import { runResumeSemanticIndexJob } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/indexer";
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
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-upload-batches/dao/batches";
import {
  getClaimMissRetryError,
  processBatchItem,
  processNextItem,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-upload-batches/utils/processor";

// Real DB round-trips routinely exceed the default 5s under parallel suite load.
vi.setConfig({ testTimeout: 30_000 });

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/s3", async () => {
  const actual = await vi.importActual<typeof S3Module>(
    "@arc/ai-recruitment-copilot-backend/lib/server/s3",
  );
  return {
    ...actual,
    getObjectStream: vi.fn(),
  };
});

vi.mock("@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent", async () => {
  const actual = await vi.importActual<typeof ResumeAgentModule>(
    "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent",
  );
  return {
    ...actual,
    generateResumeReview: vi.fn(),
    // Must mock screening too — real path can hang on network / model calls.
    generateResumeScreeningResult: vi.fn(),
    parseResumeBytesToProfile: vi.fn(),
  };
});

vi.mock(
  "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/dedup-service",
  async () => {
    const actual = await vi.importActual<typeof DedupServiceModule>(
      "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/dedup-service",
    );
    return {
      ...actual,
      findSemanticResumeDuplicates: vi.fn(),
    };
  },
);

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/enqueue", () => ({
  enqueueResumeSemanticIndexJobBestEffort: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/duplicate-matches", () => ({
  replaceDuplicateMatchesForSource: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/indexer", () => ({
  runResumeSemanticIndexJob: vi.fn(),
}));

// ─── Fixture IDs（固定前缀避免与其他测试冲突）────────────────────────────────
// Fixed prefix to avoid collisions with other test runs.
const ORG_A = "bulk_proc_org_a";
const USER_A = "bulk_proc_user_a";

const NOW = new Date("2026-05-18T10:00:00.000Z");
const REVIEW_RESULT = {
  review: "自动生成的简历评价",
  structuredReview: {
    biasScan: { items: [] },
    dimensions: {
      educationBackground: { rationale: "学历背景符合预期", score: 75 },
      experienceRelevance: { rationale: "经验相关", score: 78 },
      potential: { rationale: "潜力良好", score: 80 },
      projectMatch: { rationale: "项目匹配", score: 80 },
      skillMatch: { rationale: "技能匹配", score: 80 },
      stability: { rationale: "稳定性可接受", score: 75 },
    },
    levelRecommendation: { level: "中级", rationale: "经验匹配" },
    nextStep: {
      action: "interview",
      disclaimer: "以上为初步结论",
      interviewFocus: ["项目贡献"],
      rationale: "建议面试核实",
    },
    overall: {
      baseScore: 79,
      conclusion: "候选人匹配度较高。",
      scoreRationale: "基于六维度按 35/25/15/10/8/7 加权得出基础分 79（不含历史面试加权）",
    },
    schemaVersion: 4,
    strengths: [{ evidence: "简历证据", impact: "匹配岗位", point: "经验匹配" }],
    teamPositioning: { rationale: "经历集中", suggestion: "业务团队" },
    weaknesses: [{ evidence: null, impact: "需面试确认", point: "细节不足" }],
  },
} as const;

const EMPTY_SCREENING_RESULT = {
  policyEmpty: true,
  policyEnabled: false,
  policyHash: "test-policy-hash",
  policyVersion: 1,
  recommendation: "pass" as const,
  ruleResults: [],
};

// ─── Mock helpers ─────────────────────────────────────────────────────────────

// 返回一个有效的 ReadableStream 响应体，模拟 S3 成功返回。
// Returns a valid ReadableStream body to simulate a successful S3 fetch.
function mockS3OK() {
  const stream = new Blob(["fake bytes"]).stream();
  (getObjectStream as ReturnType<typeof vi.fn>).mockResolvedValue({
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
  (parseResumeBytesToProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
    parsedPageCount: 1,
    parsedStructured: { profile },
    parsedText: `${profile.name} OCR 原文`,
    parsedTextSource: "qwen-ocr",
    resumeProfile: profile,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// 构造最小化 files 入参。
// Build a minimal files array for insertBatchWithItems.
function makeFiles(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    contentHash: `${String(i + 1).repeat(64)}`,
    fileSize: 1024 * (i + 1),
    originalFileName: `resume_${i}.pdf`,
    storageKey: `storage/bulk-proc-test/${crypto.randomUUID()}.pdf`,
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
  await db.delete(resumePoolItem).where(eq(resumePoolItem.organizationId, ORG_A));

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
  vi.resetAllMocks();
  (generateResumeReview as ReturnType<typeof vi.fn>).mockResolvedValue(REVIEW_RESULT);
  (generateResumeScreeningResult as ReturnType<typeof vi.fn>).mockResolvedValue(
    EMPTY_SCREENING_RESULT,
  );
  (findSemanticResumeDuplicates as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (enqueueResumeSemanticIndexJobBestEffort as ReturnType<typeof vi.fn>).mockImplementation(() =>
    Promise.resolve(),
  );
  (replaceDuplicateMatchesForSource as ReturnType<typeof vi.fn>).mockImplementation(() =>
    Promise.resolve(0),
  );
  (runResumeSemanticIndexJob as ReturnType<typeof vi.fn>).mockImplementation(() =>
    Promise.resolve(),
  );
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
    expect(interview.notes).toBe("自动生成的简历评价");
    expect(interview.resumeParseStatus).toBe("ready");
    expect(interview.resumeParsedAt).toBeTruthy();
    expect(interview.resumeText).toBe("Test User OCR 原文");

    // 验证 batch 计数器更新正确。
    // Verify batch counters are updated correctly.
    expect(result?.batch.processedCount).toBe(1);
    expect(result?.batch.succeededCount).toBe(1);
    expect(result?.batch.status).toBe("completed");
  });
});

describe("processNextItem — cancellation race", () => {
  it("解析中被取消后不再写入 succeeded 或触发 embedding", async () => {
    const { batchId, item, recordId } = await createQueuedSingleItemBatch();

    mockS3OK();
    (parseResumeBytesToProfile as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      const cancelled = await cancelBatch(batchId, ORG_A, USER_A);
      expect(cancelled).toBe(true);
      return {
        parsedPageCount: 1,
        parsedStructured: { name: "Cancelled User" },
        parsedText: "Cancelled User OCR 原文",
        parsedTextSource: "qwen-ocr",
        resumeProfile: {
          email: "cancelled@example.com",
          name: "Cancelled User",
          phone: null,
          targetRoles: ["Engineer"],
        },
      };
    });

    const result = await processBatchItem(item.id);

    expect(result?.batch.status).toBe("cancelled");
    expect(result?.done).toBe(true);
    expect(result?.item?.status).toBe("cancelled");
    expect(result?.item?.resumeRecordId).toBeNull();
    expect(enqueueResumeSemanticIndexJobBestEffort).not.toHaveBeenCalled();

    const records = await db.select().from(studioInterview).where(eq(studioInterview.id, recordId));
    expect(records).toHaveLength(0);
  });
});

describe("processNextItem — resume pool target", () => {
  it("target=resume_pool + 绑定 JD → 按该 JD 生成推荐评价并写入备注", async () => {
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
    // Review generation now also receives a screening snapshot (even when policy is empty).
    expect(generateResumeReview).toHaveBeenCalledWith(
      expect.objectContaining({
        jobDescription: expect.stringContaining("岗位名称：运维总监"),
        resumeProfile: expect.objectContaining({ name: "Ops User" }),
        screeningResult: expect.objectContaining({
          policyEmpty: true,
          recommendation: "pass",
        }),
      }),
    );

    const [poolItem] = await db
      .select()
      .from(resumePoolItem)
      .where(eq(resumePoolItem.id, beforeItem?.poolItemId ?? ""));
    expect(poolItem?.jobDescriptionId).toBe(jobDescriptionId);
    expect(poolItem?.notes).toBe("自动生成的简历评价");
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
    expect(runResumeSemanticIndexJob).toHaveBeenCalledWith({
      organizationId: ORG_A,
      sourceId: beforeItem?.poolItemId,
      sourceType: "resume_pool_item",
    });
    expect(enqueueResumeSemanticIndexJobBestEffort).not.toHaveBeenCalled();
  });

  it("私有简历池 target=resume_pool + skip 查重命中时仍然创建并记录疑似重复", async () => {
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

    const matches = [
      {
        candidateEmail: "existing@example.com",
        candidateName: "Existing Candidate",
        candidatePhone: null,
        conflictingSignals: [],
        createdAt: NOW.toISOString(),
        id: "existing_record",
        jobDescriptionName: null,
        level: "high",
        score: 0.96,
        semanticReasons: ["整体履历高度相似"],
        similarity: { resumeOverview: 0.96 },
        status: "active",
        targetRole: null,
      },
    ];
    (findSemanticResumeDuplicates as ReturnType<typeof vi.fn>).mockResolvedValue(matches);
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
    expect(enqueueResumeSemanticIndexJobBestEffort).not.toHaveBeenCalled();
    expect(findSemanticResumeDuplicates).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_A,
        poolOwnerUserId: USER_A,
        poolScope: "private",
        sourceTypes: ["studio_interview", "resume_pool_item"],
      }),
    );
    expect(replaceDuplicateMatchesForSource).toHaveBeenCalledWith({
      matches,
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
    (parseResumeBytesToProfile as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("parse failed"),
    );

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
