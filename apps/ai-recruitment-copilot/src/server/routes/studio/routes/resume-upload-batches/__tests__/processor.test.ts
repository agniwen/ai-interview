// 批量简历上传 processor 集成测试 —— 真实 PG，mock S3 和简历解析器。
// Integration tests for the bulk-upload processor — real Postgres, mocked S3 + parser.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/server/db";
import type * as S3Module from "@/lib/server/s3";
import { getObjectStream } from "@/lib/server/s3";
import type * as ResumeAgentModule from "@/server/agents/resume-analysis-agent";
import { parseResumeFastToProfile } from "@/server/agents/resume-analysis-agent";
import {
  member,
  organization,
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import { insertBatchWithItems } from "@/server/routes/studio/routes/resume-upload-batches/dao/batches";
import { processNextItem } from "@/server/routes/studio/routes/resume-upload-batches/utils/processor";

vi.mock("@/lib/server/s3", async () => {
  const actual = await vi.importActual<typeof S3Module>("@/lib/server/s3");
  return {
    ...actual,
    getObjectStream: vi.fn(),
  };
});

vi.mock("@/server/agents/resume-analysis-agent", async () => {
  const actual = await vi.importActual<typeof ResumeAgentModule>(
    "@/server/agents/resume-analysis-agent",
  );
  return {
    ...actual,
    parseResumeFastToProfile: vi.fn(),
  };
});

// ─── Fixture IDs（固定前缀避免与其他测试冲突）────────────────────────────────
// Fixed prefix to avoid collisions with other test runs.
const ORG_A = "bulk_proc_org_a";
const USER_A = "bulk_proc_user_a";

const NOW = new Date("2026-05-18T10:00:00.000Z");

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
  (parseResumeFastToProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
    resumeProfile: profile,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// 构造最小化 files 入参。
// Build a minimal files array for insertBatchWithItems.
function makeFiles(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    fileSize: 1024 * (i + 1),
    originalFileName: `resume_${i}.pdf`,
    storageKey: `storage/bulk-proc-test/${crypto.randomUUID()}.pdf`,
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

  await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.organizationId, ORG_A));
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
});

// ─── Test 1: happy path ───────────────────────────────────────────────────────

describe("processNextItem — happy path", () => {
  it("pending item → succeeded，batch 变 completed，resumeRecordId 已设置", async () => {
    // Happy path: single-item batch processes to succeeded; batch becomes completed.
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
      email: "test@example.com",
      name: "Test User",
      phone: null,
      targetRoles: ["Engineer"],
    });

    const result = await processNextItem(batchId, ORG_A, USER_A);

    // 结果完整性断言 / Result assertions.
    expect(result).not.toBeNull();
    expect(result?.done).toBe(true);
    expect(result?.item).not.toBeNull();
    expect(result?.item?.status).toBe("succeeded");
    expect(result?.item?.resumeRecordId).toBeTruthy();

    // 验证 studio_interview 行已创建。
    // Verify the studio_interview row was created.
    const recordId = result?.item?.resumeRecordId as string;
    const [interview] = await db
      .select()
      .from(studioInterview)
      .where(eq(studioInterview.id, recordId));
    expect(interview).toBeDefined();
    expect(interview?.organizationId).toBe(ORG_A);

    // 验证 batch 计数器更新正确。
    // Verify batch counters are updated correctly.
    expect(result?.batch.processedCount).toBe(1);
    expect(result?.batch.succeededCount).toBe(1);
    expect(result?.batch.status).toBe("completed");
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
    (parseResumeFastToProfile as ReturnType<typeof vi.fn>).mockRejectedValue(
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

    // 验证没有为失败的 item 创建 studio_interview。
    // Verify no studio_interview was created for the failed item.
    expect(result1?.item?.resumeRecordId).toBeNull();

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

describe("processNextItem — dedup skip", () => {
  it("重复邮箱 + skip 策略 → duplicate_skipped，不创建新 studio_interview", async () => {
    // Duplicate email + skip policy → item duplicate_skipped; no new interview row.
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
      status: "draft",
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

    expect(result?.item?.status).toBe("duplicate_skipped");
    expect(result?.batch.skippedCount).toBe(1);

    // 确认 item 没有关联到新创建的 studio_interview（resumeRecordId 为 null）。
    // Confirm no new studio_interview was created: item.resumeRecordId should be null.
    expect(result?.item?.resumeRecordId).toBeNull();

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
