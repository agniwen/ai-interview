// 批量简历上传 DAO 集成测试（直接连接真实 PG 数据库，不 mock）。
// Integration tests for the bulk-resume-upload batch DAO — hit the real Postgres
// dev database; no mocking per project convention.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@app/server/lib/server/db";
import {
  department,
  jobDescription,
  member,
  organization,
  resumeDuplicateMatch,
  resumePoolItem,
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import {
  cancelBatch,
  deleteBatch,
  insertBatchWithItems,
} from "@app/server/server/routes/studio/routes/resume-upload-batches/dao/batches";
import { deleteFixtureResumePoolItems } from "../../../../../../test-utils/db-fixture-cleanup";

// 固定前缀，避免与其他测试数据冲突。
// Fixed prefix so fixture data doesn't collide with other test runs.
const ORG_A = "bulk_dao_cancel_org_a";
const ORG_B = "bulk_dao_cancel_org_b";
const USER_A = "bulk_dao_cancel_user_a";
const USER_B = "bulk_dao_cancel_user_b";
const DEPARTMENT_A = "bulk_dao_cancel_department_a";
const REFERRAL_JD = "bulk_dao_cancel_referral_jd";
const MEMBER_A = "bulk_dao_cancel_member_a";
const MEMBER_B = "bulk_dao_cancel_member_b";
/** Suite-unique storage prefix so cleanup never leaves null-org pool orphans. */
const STORAGE_KEY_PREFIX = "storage/test/bulk-dao-cancel/";

const NOW = new Date("2026-05-18T10:00:00.000Z");

// 构造最小化 files 入参的辅助函数。
// Helper: build a minimal files array for insertBatchWithItems.
function makeFiles(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    contentHash: `${String(i).repeat(64)}`,
    fileSize: 1024 * (i + 1),
    originalFileName: `resume_${i}.pdf`,
    storageKey: `${STORAGE_KEY_PREFIX}${crypto.randomUUID()}.pdf`,
  }));
}

async function cleanup() {
  // FK-ordered: batches/interviews/matches first, then pool rows by every ownership
  // key (org/user/storage) before deleting orgs/users — pool FKs are SET NULL.
  await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.organizationId, ORG_A));
  await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.organizationId, ORG_B));
  await db.delete(resumeDuplicateMatch).where(eq(resumeDuplicateMatch.organizationId, ORG_A));
  await db.delete(resumeDuplicateMatch).where(eq(resumeDuplicateMatch.organizationId, ORG_B));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_A));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_B));
  await deleteFixtureResumePoolItems({
    organizationIds: [ORG_A, ORG_B],
    storageKeyPrefixes: [STORAGE_KEY_PREFIX],
    userIds: [USER_A, USER_B],
  });
  await db.delete(jobDescription).where(eq(jobDescription.organizationId, ORG_A));
  await db.delete(department).where(eq(department.organizationId, ORG_A));
  await db.delete(member).where(eq(member.userId, USER_A));
  await db.delete(member).where(eq(member.userId, USER_B));
  await db.delete(organization).where(eq(organization.id, ORG_A));
  await db.delete(organization).where(eq(organization.id, ORG_B));
  await db.delete(user).where(eq(user.id, USER_A));
  await db.delete(user).where(eq(user.id, USER_B));
}

beforeAll(async () => {
  await cleanup();

  await db.insert(user).values([
    {
      createdAt: NOW,
      email: "bulk-dao-cancel-a@example.com",
      emailVerified: false,
      id: USER_A,
      name: "bulk-dao-user-a",
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      email: "bulk-dao-cancel-b@example.com",
      emailVerified: false,
      id: USER_B,
      name: "bulk-dao-user-b",
      updatedAt: NOW,
    },
  ]);

  await db.insert(organization).values([
    { createdAt: NOW, id: ORG_A, name: "Bulk DAO Cancel Org A", slug: "bulk-dao-cancel-org-a" },
    { createdAt: NOW, id: ORG_B, name: "Bulk DAO Cancel Org B", slug: "bulk-dao-cancel-org-b" },
  ]);

  await db.insert(member).values([
    {
      createdAt: NOW,
      id: MEMBER_A,
      organizationId: ORG_A,
      role: "owner",
      userId: USER_A,
    },
    {
      createdAt: NOW,
      id: MEMBER_B,
      organizationId: ORG_B,
      role: "owner",
      userId: USER_B,
    },
  ]);
  await db.insert(department).values({
    createdAt: NOW,
    createdBy: USER_A,
    id: DEPARTMENT_A,
    name: "Bulk DAO Department A",
    organizationId: ORG_A,
    updatedAt: NOW,
  });
  await db.insert(jobDescription).values({
    createdAt: NOW,
    createdBy: USER_A,
    departmentId: DEPARTMENT_A,
    id: REFERRAL_JD,
    name: "内推前端工程师",
    organizationId: ORG_A,
    prompt: "负责前端开发。",
    updatedAt: NOW,
  });
});

afterAll(async () => {
  await cleanup();
});

// ─── Test 1: insertBatchWithItems ────────────────────────────────────────────

describe("cancelBatch", () => {
  it("取消 pending/processing items，不影响 succeeded items；batch 变 cancelled", async () => {
    // Cancels pending/processing items; succeeded items are untouched. Batch → cancelled.
    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(3),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });

    try {
      const items = await db
        .select()
        .from(resumeUploadBatchItem)
        .where(eq(resumeUploadBatchItem.batchId, batchId));
      const [succeededItem] = items;
      expect(succeededItem).toBeDefined();

      // 手动把第一个 item 设为 succeeded（模拟已处理完的情况）。
      // Manually mark the first item as succeeded to simulate a processed item.
      await db
        .update(resumeUploadBatchItem)
        .set({ finishedAt: new Date(), status: "succeeded" })
        .where(eq(resumeUploadBatchItem.id, succeededItem?.id ?? ""));
      const cancellableItem = items.find((item) => item.id !== succeededItem?.id);
      const cancellablePoolItem = items.find(
        (item) => item.id !== succeededItem?.id && item.id !== cancellableItem?.id,
      );
      const recordId = `bulk_cancel_duplicate_${crypto.randomUUID()}`;
      const poolItemId = `bulk_cancel_pool_duplicate_${crypto.randomUUID()}`;
      await db.insert(studioInterview).values({
        candidateEmail: "bulk-cancel@example.com",
        candidateName: "批量取消候选人",
        createdAt: NOW,
        createdBy: USER_A,
        id: recordId,
        interviewQuestions: [],
        notes: null,
        organizationId: ORG_A,
        resumeFileName: "bulk-cancel.pdf",
        targetRole: null,
        updatedAt: NOW,
      });
      await db
        .update(resumeUploadBatchItem)
        .set({ resumeRecordId: recordId, status: "processing" })
        .where(eq(resumeUploadBatchItem.id, cancellableItem?.id ?? ""));
      await db.insert(resumePoolItem).values({
        candidateEmail: "bulk-cancel-pool@example.com",
        candidateName: "批量取消广场候选人",
        candidatePhone: null,
        createdAt: NOW,
        createdBy: USER_A,
        id: poolItemId,
        notes: null,
        organizationId: ORG_A,
        resumeFileName: "bulk-cancel-pool.pdf",
        resumeParseStatus: "processing",
        scope: "private",
        status: "active",
        targetRole: null,
        updatedAt: NOW,
      });
      await db
        .update(resumeUploadBatchItem)
        .set({ poolItemId, status: "processing" })
        .where(eq(resumeUploadBatchItem.id, cancellablePoolItem?.id ?? ""));
      await db.insert(resumeDuplicateMatch).values([
        {
          embeddingVersion: "test-v1",
          id: `bulk_cancel_duplicate_source_${crypto.randomUUID()}`,
          level: "medium",
          matchedSourceId: "existing_resume_record",
          matchedSourceType: "studio_interview",
          organizationId: ORG_A,
          reasons: ["批量取消前已写入疑似重复"],
          score: 86,
          sourceId: recordId,
          sourceType: "studio_interview",
          status: "active",
        },
        {
          embeddingVersion: "test-v1",
          id: `bulk_cancel_duplicate_target_${crypto.randomUUID()}`,
          level: "high",
          matchedSourceId: recordId,
          matchedSourceType: "studio_interview",
          organizationId: ORG_A,
          reasons: ["批量取消前被其他简历命中"],
          score: 94,
          sourceId: "existing_resume_record",
          sourceType: "studio_interview",
          status: "active",
        },
        {
          embeddingVersion: "test-v1",
          id: `bulk_cancel_pool_duplicate_source_${crypto.randomUUID()}`,
          level: "medium",
          matchedSourceId: "existing_resume_record",
          matchedSourceType: "studio_interview",
          organizationId: ORG_A,
          reasons: ["批量取消前广场记录已写入疑似重复"],
          score: 87,
          sourceId: poolItemId,
          sourceType: "resume_pool_item",
          status: "active",
        },
        {
          embeddingVersion: "test-v1",
          id: `bulk_cancel_pool_duplicate_target_${crypto.randomUUID()}`,
          level: "high",
          matchedSourceId: poolItemId,
          matchedSourceType: "resume_pool_item",
          organizationId: ORG_A,
          reasons: ["批量取消前广场记录被其他简历命中"],
          score: 95,
          sourceId: "existing_resume_record",
          sourceType: "studio_interview",
          status: "active",
        },
      ]);

      const result = await cancelBatch(batchId, ORG_A, USER_A);
      expect(result).toBe(true);

      const afterItems = await db
        .select()
        .from(resumeUploadBatchItem)
        .where(eq(resumeUploadBatchItem.batchId, batchId));

      const succeededAfter = afterItems.find((r) => r.id === succeededItem?.id);
      expect(succeededAfter?.status).toBe("succeeded");

      const cancelledItems = afterItems.filter((r) => r.status === "cancelled");
      expect(cancelledItems).toHaveLength(2);

      const [batch] = await db
        .select()
        .from(resumeUploadBatch)
        .where(eq(resumeUploadBatch.id, batchId));
      expect(batch?.status).toBe("cancelled");
      expect(batch?.completedAt).not.toBeNull();
      const duplicateRows = await db
        .select({
          matchedSourceId: resumeDuplicateMatch.matchedSourceId,
          sourceId: resumeDuplicateMatch.sourceId,
        })
        .from(resumeDuplicateMatch)
        .where(eq(resumeDuplicateMatch.organizationId, ORG_A));
      expect(
        duplicateRows.filter(
          (row) =>
            row.sourceId === recordId ||
            row.matchedSourceId === recordId ||
            row.sourceId === poolItemId ||
            row.matchedSourceId === poolItemId,
        ),
      ).toHaveLength(0);
    } finally {
      await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, batchId));
      await db.delete(resumeDuplicateMatch).where(eq(resumeDuplicateMatch.organizationId, ORG_A));
    }
  });

  // ─── Test 9: cancelBatch on terminal batch ───────────────────────────────────

  it("对已终结的批次调用 cancelBatch 返回 false，无副作用", async () => {
    // cancelBatch on an already-terminal batch returns false and is a no-op.
    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(1),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });

    try {
      // 手动完成批次。
      await db
        .update(resumeUploadBatch)
        .set({ completedAt: new Date(), status: "completed" })
        .where(eq(resumeUploadBatch.id, batchId));

      const result = await cancelBatch(batchId, ORG_A, USER_A);
      expect(result).toBe(false);

      // 验证 batch 状态未改变。
      const [batch] = await db
        .select()
        .from(resumeUploadBatch)
        .where(eq(resumeUploadBatch.id, batchId));
      expect(batch?.status).toBe("completed");
    } finally {
      await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, batchId));
    }
  });

  it("对已 cancelled 的批次调用 cancelBatch 同样返回 false", async () => {
    // cancelBatch on an already-cancelled batch also returns false.
    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(1),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });

    try {
      await cancelBatch(batchId, ORG_A, USER_A);
      const secondResult = await cancelBatch(batchId, ORG_A, USER_A);
      expect(secondResult).toBe(false);
    } finally {
      await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, batchId));
    }
  });
});

// ─── Test 10: deleteBatch ────────────────────────────────────────────────────

describe("deleteBatch", () => {
  it("pending 批次拒绝删除；取消后可删除，items 级联清除", async () => {
    // Non-terminal batch cannot be deleted; after cancellation it can be, and items cascade.
    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(2),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });

    // 活跃批次不可删除。
    // Active batch must be refused.
    const refusedResult = await deleteBatch(batchId, ORG_A, USER_A);
    expect(refusedResult).toBe(false);

    // batch 和 items 依然存在。
    const [batchAfterRefuse] = await db
      .select()
      .from(resumeUploadBatch)
      .where(eq(resumeUploadBatch.id, batchId));
    expect(batchAfterRefuse).toBeDefined();

    const itemsAfterRefuse = await db
      .select()
      .from(resumeUploadBatchItem)
      .where(eq(resumeUploadBatchItem.batchId, batchId));
    expect(itemsAfterRefuse).toHaveLength(2);

    // 取消后可删除。
    await cancelBatch(batchId, ORG_A, USER_A);
    const deletedResult = await deleteBatch(batchId, ORG_A, USER_A);
    expect(deletedResult).toBe(true);

    // batch 和 items 均已删除（items 通过 cascade 删除）。
    const [batchAfterDelete] = await db
      .select()
      .from(resumeUploadBatch)
      .where(eq(resumeUploadBatch.id, batchId));
    expect(batchAfterDelete).toBeUndefined();

    const itemsAfterDelete = await db
      .select()
      .from(resumeUploadBatchItem)
      .where(eq(resumeUploadBatchItem.batchId, batchId));
    expect(itemsAfterDelete).toHaveLength(0);
  });
});
