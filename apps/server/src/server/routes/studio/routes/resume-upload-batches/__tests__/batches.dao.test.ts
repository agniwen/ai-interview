// 批量简历上传 DAO 集成测试（直接连接真实 PG 数据库，不 mock）。
// Integration tests for the bulk-resume-upload batch DAO — hit the real Postgres
// dev database; no mocking per project convention.

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../../../../lib/server/db/index";
import {
  department,
  jobDescription,
  member,
  organization,
  resumeDuplicateMatch,
  resumePoolEvent,
  resumePoolItem,
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import {
  cancelBatch,
  claimNextPendingItem,
  claimPendingItemById,
  insertBatchWithItems,
  loadActiveBatch,
  loadActiveBatches,
  loadBatchDetail,
  reconcileBatchProgress,
  recoverIncompleteBatchItems,
  reviveOrphans,
  reviveRetriableFailures,
} from "../dao/batches";
import { deleteFixtureResumePoolItems } from "../../../../../../test-utils/db-fixture-cleanup";

// 固定前缀，避免与其他测试数据冲突。
// Fixed prefix so fixture data doesn't collide with other test runs.
const ORG_A = "bulk_dao_org_a";
const ORG_B = "bulk_dao_org_b";
const USER_A = "bulk_dao_user_a";
const USER_B = "bulk_dao_user_b";
const DEPARTMENT_A = "bulk_dao_department_a";
const REFERRAL_JD = "bulk_dao_referral_jd";
/** Suite-unique storage prefix so cleanup never leaves null-org pool orphans. */
const STORAGE_KEY_PREFIX = "storage/test/bulk-dao/";

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
      email: "bulk-dao-a@example.com",
      emailVerified: false,
      id: USER_A,
      name: "bulk-dao-user-a",
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      email: "bulk-dao-b@example.com",
      emailVerified: false,
      id: USER_B,
      name: "bulk-dao-user-b",
      updatedAt: NOW,
    },
  ]);

  await db.insert(organization).values([
    { createdAt: NOW, id: ORG_A, name: "Bulk DAO Org A", slug: "bulk-dao-org-a" },
    { createdAt: NOW, id: ORG_B, name: "Bulk DAO Org B", slug: "bulk-dao-org-b" },
  ]);

  await db.insert(member).values([
    {
      createdAt: NOW,
      id: "bulk_dao_member_a",
      organizationId: ORG_A,
      role: "owner",
      userId: USER_A,
    },
    {
      createdAt: NOW,
      id: "bulk_dao_member_b",
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

describe("insertBatchWithItems", () => {
  it("写入 batch 行（status=pending, totalCount=N）以及 N 个 pending items", async () => {
    // Creates a batch row with status=pending and N items, all pending.
    const N = 3;
    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(N),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });

    try {
      const [batch] = await db
        .select()
        .from(resumeUploadBatch)
        .where(eq(resumeUploadBatch.id, batchId));
      expect(batch).toBeDefined();
      expect(batch?.status).toBe("pending");
      expect(batch?.totalCount).toBe(N);
      expect(batch?.processedCount).toBe(0);
      expect(batch?.succeededCount).toBe(0);
      expect(batch?.failedCount).toBe(0);
      expect(batch?.skippedCount).toBe(0);

      const items = await db
        .select()
        .from(resumeUploadBatchItem)
        .where(eq(resumeUploadBatchItem.batchId, batchId));
      expect(items).toHaveLength(N);
      for (const item of items) {
        expect(item.status).toBe("pending");
        expect(item.resumeRecordId).toBeTruthy();
      }
      const orderIndexes = items.map((r) => r.orderIndex).toSorted((a, b) => a - b);
      expect(orderIndexes).toEqual([0, 1, 2]);

      const records = await db
        .select()
        .from(studioInterview)
        .where(eq(studioInterview.organizationId, ORG_A));
      expect(records).toHaveLength(N);
      for (const record of records) {
        expect(record.resumeParseStatus).toBe("queued");
        expect(record.resumeProfile).toBeNull();
        expect(record.resumeStorageKey).toBeTruthy();
      }
    } finally {
      await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, batchId));
    }
  });

  it("writes referral target role into resume pool placeholders", async () => {
    const batchId = await insertBatchWithItems({
      dedupPolicy: "create",
      files: makeFiles(1),
      jdMode: "bind",
      jobDescriptionId: REFERRAL_JD,
      organizationId: ORG_A,
      referralTargetRole: "内推前端工程师",
      resumePoolScope: "public",
      sourceChannel: "referral",
      target: "resume_pool",
      userId: USER_A,
    });

    try {
      const detail = await loadBatchDetail(batchId, ORG_A, USER_A);
      const poolItemId = detail?.items[0]?.poolItemId;
      expect(poolItemId).toBeTruthy();
      if (!poolItemId) {
        throw new Error("Expected resume pool item to be created");
      }

      const [poolItem] = await db
        .select()
        .from(resumePoolItem)
        .where(eq(resumePoolItem.id, poolItemId));

      expect(poolItem?.jobDescriptionId).toBe(REFERRAL_JD);
      expect(poolItem?.sourceChannel).toBe("referral");
      expect(poolItem?.targetRole).toBe("内推前端工程师");
      const [bindingEvent] = await db
        .select({ payload: resumePoolEvent.payload })
        .from(resumePoolEvent)
        .where(and(eq(resumePoolEvent.poolItemId, poolItemId), eq(resumePoolEvent.type, "bound")));
      expect(bindingEvent?.payload).toEqual(
        expect.objectContaining({ bindingMode: "automatic", source: "referral" }),
      );
    } finally {
      await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, batchId));
      await deleteFixtureResumePoolItems({
        organizationIds: [ORG_A],
        storageKeyPrefixes: [STORAGE_KEY_PREFIX],
        userIds: [USER_A],
      });
    }
  });

  it("records a mail-ingest fixed-job binding as automatic before resume parsing", async () => {
    const batchId = await insertBatchWithItems({
      dedupPolicy: "create",
      files: makeFiles(1),
      jdMode: "bind",
      jobDescriptionId: REFERRAL_JD,
      jobMatchRequestedAt: new Date(),
      organizationId: ORG_A,
      resumePoolScope: "public",
      sourceChannel: "mail_ingest",
      target: "resume_pool",
      userId: USER_A,
    });

    try {
      const detail = await loadBatchDetail(batchId, ORG_A, USER_A);
      const poolItemId = detail?.items[0]?.poolItemId;
      expect(poolItemId).toBeTruthy();
      if (!poolItemId) {
        throw new Error("Expected resume pool item to be created");
      }
      const [bindingEvent] = await db
        .select({ payload: resumePoolEvent.payload })
        .from(resumePoolEvent)
        .where(and(eq(resumePoolEvent.poolItemId, poolItemId), eq(resumePoolEvent.type, "bound")));

      expect(bindingEvent?.payload).toEqual(
        expect.objectContaining({ bindingMode: "automatic", source: "batch_fixed_job" }),
      );
    } finally {
      await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, batchId));
      await deleteFixtureResumePoolItems({
        organizationIds: [ORG_A],
        storageKeyPrefixes: [STORAGE_KEY_PREFIX],
        userIds: [USER_A],
      });
    }
  });

  it("does not bind job descriptions to resume pool placeholders outside bind mode", async () => {
    const batchId = await insertBatchWithItems({
      dedupPolicy: "create",
      files: makeFiles(1),
      jdMode: "auto",
      jobDescriptionId: REFERRAL_JD,
      organizationId: ORG_A,
      resumePoolScope: "public",
      target: "resume_pool",
      userId: USER_A,
    });

    try {
      const detail = await loadBatchDetail(batchId, ORG_A, USER_A);
      const poolItemId = detail?.items[0]?.poolItemId;
      expect(poolItemId).toBeTruthy();
      if (!poolItemId) {
        throw new Error("Expected resume pool item to be created");
      }

      const [poolItem] = await db
        .select()
        .from(resumePoolItem)
        .where(eq(resumePoolItem.id, poolItemId));

      expect(poolItem?.jobDescriptionId).toBeNull();
    } finally {
      await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, batchId));
      await deleteFixtureResumePoolItems({
        organizationIds: [ORG_A],
        storageKeyPrefixes: [STORAGE_KEY_PREFIX],
        userIds: [USER_A],
      });
    }
  });
});

// ─── Test 2: multiple active batches ─────────────────────────────────────────

describe("multiple active batches", () => {
  it("同一 (org, user) 可以同时存在多个活跃批次", async () => {
    // A user can start a second active batch without waiting for the first one
    // to finish; both should be returned by active-batch discovery.
    const firstBatchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(1),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });
    const secondBatchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(1),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });

    try {
      const active = await loadActiveBatches(ORG_A, USER_A);
      expect(active.map((detail) => detail.batch.id).toSorted()).toEqual(
        [firstBatchId, secondBatchId].toSorted(),
      );
    } finally {
      await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, firstBatchId));
      await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, secondBatchId));
    }
  });
});

// ─── Test 3: loadBatchDetail scoping ────────────────────────────────────────

describe("loadBatchDetail", () => {
  it("外部 org 或外部 user 访问返回 null，本人本 org 返回详情", async () => {
    // Returns null for foreign org or foreign user; correct (org, user) returns detail.
    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(2),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });

    try {
      // 外部 org
      const byWrongOrg = await loadBatchDetail(batchId, ORG_B, USER_A);
      expect(byWrongOrg).toBeNull();

      // 外部 user（USER_B 不属于 ORG_A，但此处仅测 createdBy 字段匹配）
      // Foreign user — only createdBy is checked in the query.
      const byWrongUser = await loadBatchDetail(batchId, ORG_A, USER_B);
      expect(byWrongUser).toBeNull();

      // 正确组合
      const detail = await loadBatchDetail(batchId, ORG_A, USER_A);
      expect(detail).not.toBeNull();
      expect(detail?.batch.id).toBe(batchId);
      expect(detail?.items).toHaveLength(2);
    } finally {
      await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, batchId));
    }
  });
});

describe("reconcileBatchProgress", () => {
  it("按 item 终态重算并修正并发 lost update 后的批次计数", async () => {
    // Recomputes counters from item terminal states and fixes stale batch counters
    // left behind by concurrent worker completions.
    const batchId = await insertBatchWithItems({
      dedupPolicy: "create",
      files: makeFiles(6),
      jdMode: "auto",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });

    try {
      await db
        .update(resumeUploadBatchItem)
        .set({ finishedAt: new Date(), status: "succeeded" })
        .where(eq(resumeUploadBatchItem.batchId, batchId));
      await db
        .update(resumeUploadBatch)
        .set({
          processedCount: 2,
          status: "running",
          succeededCount: 2,
        })
        .where(eq(resumeUploadBatch.id, batchId));

      await reconcileBatchProgress(batchId);
      const detail = await loadBatchDetail(batchId, ORG_A, USER_A);

      expect(detail?.batch.processedCount).toBe(6);
      expect(detail?.batch.succeededCount).toBe(6);
      expect(detail?.batch.status).toBe("completed");
      expect(detail?.batch.completedAt).toBeTruthy();

      const active = await loadActiveBatch(ORG_A, USER_A);
      expect(active).toBeNull();
    } finally {
      await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, batchId));
    }
  });
});

// ─── Test 4: loadActiveBatch returns null for terminal batches ───────────────

describe("loadActiveBatch", () => {
  it("批次变为 completed 或 cancelled 后返回 null", async () => {
    // Returns null once the batch reaches a terminal status.
    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(1),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });

    try {
      const active = await loadActiveBatch(ORG_A, USER_A);
      expect(active).not.toBeNull();

      // 手动设为 completed
      await db
        .update(resumeUploadBatch)
        .set({ completedAt: new Date(), status: "completed" })
        .where(eq(resumeUploadBatch.id, batchId));

      const afterComplete = await loadActiveBatch(ORG_A, USER_A);
      expect(afterComplete).toBeNull();
    } finally {
      await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, batchId));
    }

    // 通过 cancelBatch 取消后也应返回 null。
    // Also null after a DAO-driven cancel.
    const batchId2 = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(1),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });

    try {
      await cancelBatch(batchId2, ORG_A, USER_A);
      const afterCancel = await loadActiveBatch(ORG_A, USER_A);
      expect(afterCancel).toBeNull();
    } finally {
      await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, batchId2));
    }
  });
});

// ─── Test 5: claimNextPendingItem order ──────────────────────────────────────

describe("claimNextPendingItem", () => {
  it("按 orderIndex 顺序认领，第 N+1 次返回 null", async () => {
    // Claims items in orderIndex order; returns null when exhausted.
    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(3),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });

    try {
      const claimedIds: string[] = [];
      await db.transaction(async (tx) => {
        for (let i = 0; i < 3; i += 1) {
          const item = await claimNextPendingItem(tx, batchId);
          expect(item).not.toBeNull();
          if (item) {
            // 原始行是 snake_case，通过 id 字段跟踪认领顺序。
            // Raw row uses snake_case keys; track claim order via id.
            // SAFETY: This test constructs the value with the asserted contract before this boundary.
            const rawId = (item as { id: string }).id;
            claimedIds.push(rawId);
          }
        }
        const none = await claimNextPendingItem(tx, batchId);
        expect(none).toBeNull();
      });
      // 事务提交后，通过 DB 查询验证 orderIndex 顺序符合 0, 1, 2。
      // After the transaction, verify the claimed items were processed in orderIndex order.
      const processedItems = await db
        .select({ id: resumeUploadBatchItem.id, orderIndex: resumeUploadBatchItem.orderIndex })
        .from(resumeUploadBatchItem)
        .where(eq(resumeUploadBatchItem.batchId, batchId));
      const idToOrderIndex = new Map(processedItems.map((r) => [r.id, r.orderIndex]));
      const claimedOrderIndexes = claimedIds.map((id) => idToOrderIndex.get(id));
      expect(claimedOrderIndexes).toEqual([0, 1, 2]);
    } finally {
      await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, batchId));
    }
  });
});

// ─── Test 6: claimNextPendingItem concurrency ─────────────────────────────────

describe("claimNextPendingItem concurrency", () => {
  it("FOR UPDATE SKIP LOCKED：并发认领的两个 item 不重复", async () => {
    // Two concurrent transactions must claim different items (SKIP LOCKED prevents double-claim).
    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(3),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });

    try {
      const results = await Promise.all([
        db.transaction((tx) => claimNextPendingItem(tx, batchId)),
        db.transaction((tx) => claimNextPendingItem(tx, batchId)),
        db.transaction((tx) => claimNextPendingItem(tx, batchId)),
      ]);

      const claimed = results.filter(Boolean);
      const ids = claimed.map((r) => r?.id);
      // 无重复 id，即 SKIP LOCKED 生效。
      // Unique IDs confirm no double-claim.
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
      // 三次并发，最多认领 3 个，每个 item 最多被认领一次。
      // At most 3 items total; each claimed at most once.
      expect(claimed.length).toBeLessThanOrEqual(3);
      expect(claimed.length).toBeGreaterThan(0);
    } finally {
      await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, batchId));
    }
  });
});

// ─── Test 7: reviveOrphans ───────────────────────────────────────────────────

describe("reviveOrphans", () => {
  it("只复活超过阈值的 processing item，fresh processing item 保持不动", async () => {
    // Only resets processing items older than the threshold; fresh processing item stays put.
    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(2),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });

    try {
      // 认领两个 item，均变为 processing。
      let oldItemId: string | null = null;
      let freshItemId: string | null = null;
      await db.transaction(async (tx) => {
        const item0 = await claimNextPendingItem(tx, batchId);
        const item1 = await claimNextPendingItem(tx, batchId);
        oldItemId = item0?.id ?? null;
        freshItemId = item1?.id ?? null;
      });

      expect(oldItemId).not.toBeNull();
      expect(freshItemId).not.toBeNull();

      // 手动把第一个 item 的 started_at 设为 120 秒前（超过阈值）。
      // Backdate the first item so it looks stale.
      await db.execute(
        sql`update resume_upload_batch_item set started_at = now() - interval '120 seconds' where id = ${oldItemId}`,
      );

      await reviveOrphans(batchId, ORG_A, USER_A, 60);

      const items = await db
        .select()
        .from(resumeUploadBatchItem)
        .where(eq(resumeUploadBatchItem.batchId, batchId));

      const oldItem = items.find((r) => r.id === oldItemId);
      const freshItem = items.find((r) => r.id === freshItemId);

      // 过期 item 应回到 pending。
      expect(oldItem?.status).toBe("pending");
      // 新鲜 item 应仍是 processing。
      expect(freshItem?.status).toBe("processing");

      // batch.status 应从 running 回到 pending。
      const [batch] = await db
        .select()
        .from(resumeUploadBatch)
        .where(eq(resumeUploadBatch.id, batchId));
      expect(batch?.status).toBe("pending");
    } finally {
      await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, batchId));
    }
  });
});

describe("reviveRetriableFailures", () => {
  it("把 S3 对象缺失失败项重置为 pending，其他失败项保持 failed", async () => {
    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(2),
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
      const [retriable, permanent] = items;
      expect(retriable).toBeDefined();
      expect(permanent).toBeDefined();

      await db
        .update(resumeUploadBatchItem)
        .set({
          errorMessage: "简历文件不可用（S3 对象缺失）。",
          finishedAt: new Date(),
          status: "failed",
        })
        .where(eq(resumeUploadBatchItem.id, retriable.id));
      await db
        .update(resumeUploadBatchItem)
        .set({
          errorMessage: "PPTX 内容为空。",
          finishedAt: new Date(),
          status: "failed",
        })
        .where(eq(resumeUploadBatchItem.id, permanent.id));
      await reconcileBatchProgress(batchId);

      await reviveRetriableFailures(batchId, ORG_A, USER_A);

      const updated = await db
        .select()
        .from(resumeUploadBatchItem)
        .where(eq(resumeUploadBatchItem.batchId, batchId));
      const updatedRetriable = updated.find((item) => item.id === retriable.id);
      const updatedPermanent = updated.find((item) => item.id === permanent.id);

      expect(updatedRetriable?.status).toBe("pending");
      expect(updatedRetriable?.errorMessage).toBeNull();
      expect(updatedRetriable?.finishedAt).toBeNull();
      expect(updatedPermanent?.status).toBe("failed");

      const [batch] = await db
        .select()
        .from(resumeUploadBatch)
        .where(eq(resumeUploadBatch.id, batchId));
      expect(batch?.status).toBe("pending");
    } finally {
      await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, batchId));
    }
  });
});

describe("recoverIncompleteBatchItems", () => {
  it("worker 启动时恢复 active batch 中的 stale processing，并返回待入队 items", async () => {
    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(2),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });

    try {
      let staleItemId: string | null = null;
      await db.transaction(async (tx) => {
        const item = await claimNextPendingItem(tx, batchId);
        staleItemId = item?.id ?? null;
      });
      expect(staleItemId).not.toBeNull();
      await db.execute(
        sql`update resume_upload_batch_item set started_at = now() - interval '120 seconds' where id = ${staleItemId}`,
      );

      const jobs = await recoverIncompleteBatchItems(60);

      const recoveredJob = jobs.find((job) => job.itemId === staleItemId);
      expect(recoveredJob).toMatchObject({
        batchId,
        itemId: staleItemId,
        organizationId: ORG_A,
        userId: USER_A,
      });
      const items = await db
        .select()
        .from(resumeUploadBatchItem)
        .where(eq(resumeUploadBatchItem.batchId, batchId));
      expect(items.find((item) => item.id === staleItemId)?.status).toBe("pending");
    } finally {
      await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, batchId));
    }
  });

  it("同一个 job 可以重新 claim stale processing item", async () => {
    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(1),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });

    try {
      let itemId: string | null = null;
      await db.transaction(async (tx) => {
        const item = await claimNextPendingItem(tx, batchId);
        itemId = item?.id ?? null;
      });
      expect(itemId).not.toBeNull();
      await db.execute(
        sql`update resume_upload_batch_item set started_at = now() - interval '1200 seconds' where id = ${itemId}`,
      );

      const reclaimed = await db.transaction((tx) => claimPendingItemById(tx, itemId ?? ""));

      expect(reclaimed?.id).toBe(itemId);
      expect(reclaimed?.status).toBe("processing");
      expect(reclaimed?.attemptCount).toBe(2);
    } finally {
      await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, batchId));
    }
  });
});

// ─── Test 8: cancelBatch item filtering ──────────────────────────────────────
