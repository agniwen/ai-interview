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
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import { insertBatchWithItems } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-upload-batches/dao/batches";
import { processNextItem } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-upload-batches/utils/processor";
import { deleteFixtureResumePoolItems } from "../../../../../../test-utils/db-fixture-cleanup";

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
const ORG_A = "bulk_proc_edge_org_a";
const USER_A = "bulk_proc_edge_user_a";
const MEMBER_A = "bulk_proc_edge_member_a";
/** Suite-unique storage prefix so cleanup never leaves null-org pool orphans. */
const STORAGE_KEY_PREFIX = "storage/bulk-proc-edge-test/";

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
    storageKey: `${STORAGE_KEY_PREFIX}${crypto.randomUUID()}.pdf`,
  }));
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
    email: "bulk-proc-edge-a@example.com",
    emailVerified: false,
    id: USER_A,
    name: "bulk-proc-user-a",
    updatedAt: NOW,
  });

  await db.insert(organization).values({
    createdAt: NOW,
    id: ORG_A,
    name: "Bulk Proc Edge Org A",
    slug: "bulk-proc-edge-org-a",
  });

  await db.insert(member).values({
    createdAt: NOW,
    id: MEMBER_A,
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

describe("processNextItem — dedup skip", () => {
  it("重复邮箱 + skip 策略不再触发跳过", async () => {
    // Duplicate email + skip policy no longer skips by identity-only dedup.
    const dupEmail = "dup@example.com";

    // 预插入一个 studio_interview，邮箱为 dupEmail。
    // Pre-insert an existing interview with the duplicate email.
    const preExistingId = crypto.randomUUID();
    await db.insert(studioInterview).values({
      candidateEmail: dupEmail,
      candidateName: "Existing Candidate",
      candidatePhone: null,
      createdAt: NOW,
      createdBy: USER_A,
      id: preExistingId,
      interviewQuestions: [],
      jobDescriptionId: null,
      notes: null,
      organizationId: ORG_A,
      resumeContentHash: null,
      resumeFileName: "existing.pdf",
      resumeProfile: null,
      resumeStorageKey: null,
      targetRole: null,
      updatedAt: NOW,
    });

    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(1),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });

    mockS3OK();
    mockParseOK({
      email: dupEmail,
      name: "Dup User",
      phone: null,
      targetRoles: [],
    });

    const result = await processNextItem(batchId, ORG_A, USER_A);

    expect(result?.item?.status).toBe("succeeded");
    expect(result?.batch.skippedCount).toBe(0);

    // 确认 item 已关联到新创建的 studio_interview。
    // Confirm a new studio_interview was created.
    expect(result?.item?.resumeRecordId).toEqual(expect.any(String));

    // 确认 preExistingId 行依然存在（未被删除）。
    // Confirm the pre-existing row still exists.
    const [preExisting] = await db
      .select({ id: studioInterview.id })
      .from(studioInterview)
      .where(eq(studioInterview.id, preExistingId));
    expect(preExisting).toBeDefined();

    // 清理预插入行（afterAll 也会处理，但提前清更干净）。
    await db.delete(studioInterview).where(eq(studioInterview.id, preExistingId));
  });

  it("语义重复 + skip 策略创建招聘台记录并记录疑似重复", async () => {
    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(1),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });
    const [beforeItem] = await db
      .select()
      .from(resumeUploadBatchItem)
      .where(eq(resumeUploadBatchItem.batchId, batchId));
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
      email: "library-dup@example.com",
      name: "Library Dup User",
      phone: "13900000003",
      targetRoles: ["Engineer"],
    });

    const result = await processNextItem(batchId, ORG_A, USER_A);

    expect(result?.item?.status).toBe("succeeded");
    expect(result?.item?.resumeRecordId).toBe(beforeItem?.resumeRecordId);
    expect(result?.batch.skippedCount).toBe(0);
    expect(replaceDuplicateMatchesForSource).toHaveBeenCalledWith({
      matches,
      organizationId: ORG_A,
      sourceId: beforeItem?.resumeRecordId,
      sourceType: "studio_interview",
    });
  });
});

// ─── Test 4: no pending + already completed ───────────────────────────────────

describe("processNextItem — no pending items, batch already completed", () => {
  it("批次已 completed + 无 pending → done=true, item=null", async () => {
    // Completed batch with no pending items → done=true, item=null.
    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(1),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });

    // 直接把 batch 设为 completed。
    await db
      .update(resumeUploadBatch)
      .set({ completedAt: new Date(), status: "completed" })
      .where(eq(resumeUploadBatch.id, batchId));

    const result = await processNextItem(batchId, ORG_A, USER_A);

    expect(result).not.toBeNull();
    expect(result?.done).toBe(true);
    expect(result?.item).toBeNull();

    // 清理。
    await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, batchId));
  });
});

// ─── Test 5: wrong tenant ────────────────────────────────────────────────────

describe("processNextItem — wrong tenant", () => {
  it("使用错误 orgId 调用 → 返回 null", async () => {
    // Calling with a mismatched org → returns null.
    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(1),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });

    const result = await processNextItem(batchId, "wrong_org_id", USER_A);

    expect(result).toBeNull();

    // 清理。
    await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, batchId));
  });
});

// ─── Test 6: S3 missing object ───────────────────────────────────────────────

describe("processNextItem — S3 missing object", () => {
  it("S3 返回 null → item failed，errorMessage 提及 S3 或缺失", async () => {
    // S3 returns null → item failed; error message mentions S3 or 缺失.
    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(1),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });

    // 模拟 S3 返回 null（对象不存在）。
    // Mock S3 returning null to simulate a missing object.
    (getObjectStream as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await processNextItem(batchId, ORG_A, USER_A);

    expect(result).not.toBeNull();
    expect(result?.item?.status).toBe("failed");
    // 错误信息中应包含 "S3" 或 "缺失"。
    // Error message should mention S3 or 缺失.
    const errMsg = result?.item?.errorMessage ?? "";
    expect(errMsg.includes("S3") || errMsg.includes("缺失")).toBe(true);
  });
});
