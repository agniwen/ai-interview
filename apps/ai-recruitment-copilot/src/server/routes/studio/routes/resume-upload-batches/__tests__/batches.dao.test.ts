// 批量简历上传 DAO 集成测试（直接连接真实 PG 数据库，不 mock）。
// Integration tests for the bulk-resume-upload batch DAO — hit the real Postgres
// dev database; no mocking per project convention.

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import {
  member,
  organization,
  resumeUploadBatch,
  resumeUploadBatchItem,
  user,
} from "@arc/db-schema/schema";
import {
  cancelBatch,
  claimNextPendingItem,
  deleteBatch,
  insertBatchWithItems,
  loadActiveBatch,
  loadBatchDetail,
  reviveOrphans,
} from "@/server/routes/studio/routes/resume-upload-batches/dao/batches";

// 固定前缀，避免与其他测试数据冲突。
// Fixed prefix so fixture data doesn't collide with other test runs.
const ORG_A = "bulk_dao_org_a";
const ORG_B = "bulk_dao_org_b";
const USER_A = "bulk_dao_user_a";
const USER_B = "bulk_dao_user_b";

const NOW = new Date("2026-05-18T10:00:00.000Z");

// 构造最小化 files 入参的辅助函数。
// Helper: build a minimal files array for insertBatchWithItems.
function makeFiles(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    fileSize: 1024 * (i + 1),
    originalFileName: `resume_${i}.pdf`,
    storageKey: `storage/test/${crypto.randomUUID()}.pdf`,
  }));
}

async function cleanup() {
  // 按照 FK 顺序清理：先清 items（cascade），再 batch，再 member，再 org，再 user。
  // FK-ordered cleanup: items cascade with batches, then members, orgs, users.
  await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.organizationId, ORG_A));
  await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.organizationId, ORG_B));
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
      }
      const orderIndexes = items.map((r) => r.orderIndex).toSorted((a, b) => a - b);
      expect(orderIndexes).toEqual([0, 1, 2]);
    } finally {
      await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, batchId));
    }
  });
});

// ─── Test 2: active-batch uniqueness ─────────────────────────────────────────

describe("active-batch uniqueness", () => {
  it("同一 (org, user) 的第二个活跃批次违反唯一索引，取消后可再次插入", async () => {
    // Second active batch for same (org, user) should violate the partial unique index;
    // after cancellation a new insert succeeds.
    const batchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(1),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });

    try {
      // Second insert should throw a unique-violation error.
      await expect(
        insertBatchWithItems({
          dedupPolicy: "skip",
          files: makeFiles(1),
          jdMode: "none",
          jobDescriptionId: null,
          organizationId: ORG_A,
          userId: USER_A,
        }),
      ).rejects.toSatisfy((err: unknown) => {
        // DrizzleQueryError 包装了原始 PostgresError，主消息是 "Failed query:..."，
        // 唯一约束信息在 .cause.message 里。同时也检查主消息，以防驱动行为变化。
        // DrizzleQueryError wraps PostgresError: unique constraint details live in .cause.message.
        const mainMsg = err instanceof Error ? err.message.toLowerCase() : "";
        const causeMsg =
          err instanceof Error && err.cause instanceof Error ? err.cause.message.toLowerCase() : "";
        const combined = `${mainMsg} ${causeMsg}`;
        return (
          combined.includes("unique") ||
          combined.includes("duplicate") ||
          combined.includes("resume_upload_batch_active_unique_idx")
        );
      });
    } finally {
      // 取消后，部分唯一索引不再覆盖该行，新批次应成功。
      // After cancellation the partial index no longer covers the row.
      await cancelBatch(batchId, ORG_A, USER_A);
    }

    // 取消后新批次应插入成功。
    // Fresh insert must succeed now.
    const newBatchId = await insertBatchWithItems({
      dedupPolicy: "skip",
      files: makeFiles(1),
      jdMode: "none",
      jobDescriptionId: null,
      organizationId: ORG_A,
      userId: USER_A,
    });
    expect(newBatchId).toBeTruthy();
    await cancelBatch(newBatchId, ORG_A, USER_A);
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
            const rawId = (item as unknown as Record<string, unknown>).id as string;
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
  it("只复活 startedAt 超过 60s 的 processing item，batch.status 回滚到 pending", async () => {
    // Only resets processing items older than 60s; fresh processing item stays put.
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

      await reviveOrphans(batchId, ORG_A, USER_A);

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

// ─── Test 8: cancelBatch item filtering ──────────────────────────────────────

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
    } finally {
      await db.delete(resumeUploadBatch).where(eq(resumeUploadBatch.id, batchId));
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
