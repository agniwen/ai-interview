// 简历上传去重 query 层单元测试 —— 覆盖 contentHash 写入与查找 (含失败状态过滤)。
// Unit tests for the chat-attachment dedup query layer — covers contentHash
// persistence and findAttachmentByContentHash (including failed-row exclusion).

import {
  createAttachment,
  findAttachmentByContentHash,
} from "@/server/routes/chat/dao/chat-attachments";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface DbRow {
  contentHash: string | null;
  parsedStatus: "ready" | "pending" | "failed";
  storageKey: string;
  [key: string]: unknown;
}

// Shared in-memory row store — reset between tests via beforeEach.
// 共享内存行存储 — 每个测试前通过 beforeEach 重置。
const rows: DbRow[] = [];

interface WhereCondition {
  matches: (row: DbRow) => boolean;
}

vi.mock("@/lib/db", () => ({
  db: {
    // insert(table).values(record) — push to in-memory store.
    // insert(table).values(record) — 写入内存存储。
    insert: (_table: unknown) => ({
      values: (record: DbRow) => {
        rows.push(record);
      },
    }),
    // select().from(table).where(condition).limit(n) — filter in-memory rows.
    // select().from(table).where(condition).limit(n) — 过滤内存行。
    select: () => ({
      from: (_table: unknown) => ({
        where: (condition: WhereCondition) => ({
          limit: (_n: number) => rows.filter((r) => condition.matches(r)).slice(0, 1),
        }),
      }),
    }),
  },
}));

// Intercept drizzle-orm helpers and convert them to plain JS predicates so the
// fake db.where() can evaluate them against our in-memory rows.
// 拦截 drizzle-orm 工厂，将其转换为纯 JS 谓词，供 fake db.where() 评估内存行。
vi.mock("drizzle-orm", () => ({
  and: (...conds: WhereCondition[]) => ({
    matches: (row: DbRow) => conds.every((c) => c.matches(row)),
  }),
  eq: (col: { name: string }, value: unknown) => ({
    matches: (row: DbRow) => row[col.name] === value,
  }),
  inArray: (col: { name: string }, values: unknown[]) => ({
    matches: (row: DbRow) => values.includes(row[col.name]),
  }),
  ne: (col: { name: string }, value: unknown) => ({
    matches: (row: DbRow) => row[col.name] !== value,
  }),
}));

// Mock schema: expose camelCase column objects whose `.name` matches the
// camelCase keys used in the in-memory row objects above.
// Mock schema：列对象的 .name 与内存行中的 camelCase 键名一致。
vi.mock("@/lib/db/schema", () => ({
  chatAttachment: {
    contentHash: { name: "contentHash" },
    id: { name: "id" },
    parsedStatus: { name: "parsedStatus" },
    userId: { name: "userId" },
  },
}));

describe("chat-attachment dedup query layer", () => {
  beforeEach(() => {
    // Clear in-memory store before each test.
    // 每个测试前清空内存存储。
    rows.length = 0;
  });

  it("createAttachment persists contentHash", async () => {
    await createAttachment({
      contentHash: "a".repeat(64),
      filename: "r.pdf",
      id: "att-1",
      mediaType: "application/pdf",
      parsedStatus: "ready",
      parsedText: "hello",
      size: 1234,
      storageKey: "chat-attachments/aaaa.pdf",
      userId: "user-1",
    });

    expect(rows[0]?.contentHash).toBe("a".repeat(64));
  });

  it("findAttachmentByContentHash returns the matching ready row", async () => {
    await createAttachment({
      contentHash: "b".repeat(64),
      filename: "r.pdf",
      id: "att-2",
      mediaType: "application/pdf",
      parsedStatus: "ready",
      size: 100,
      storageKey: "chat-attachments/bbbb.pdf",
      userId: "user-2",
    });

    const found = await findAttachmentByContentHash("b".repeat(64));
    expect(found?.storageKey).toBe("chat-attachments/bbbb.pdf");
  });

  it("findAttachmentByContentHash skips rows where parsedStatus is 'failed'", async () => {
    await createAttachment({
      contentHash: "c".repeat(64),
      filename: "r.pdf",
      id: "att-3",
      mediaType: "application/pdf",
      parsedStatus: "failed",
      size: 100,
      storageKey: "chat-attachments/cccc.pdf",
      userId: "user-3",
    });

    const found = await findAttachmentByContentHash("c".repeat(64));
    expect(found).toBeNull();
  });

  it("findAttachmentByContentHash returns null when nothing matches", async () => {
    const found = await findAttachmentByContentHash("d".repeat(64));
    expect(found).toBeNull();
  });
});
