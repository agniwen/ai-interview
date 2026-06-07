// updateStructuredByHash 单测 —— 覆盖回填、跨行扩散、幂等、hash 隔离 4 个场景。
// Unit tests for updateStructuredByHash — backfill, multi-row spread, idempotency, hash isolation.

import type { ResumeParserStructured } from "@arc/db-schema/resume-parser-schema";
import { updateStructuredByHash } from "@arc/backend/server/routes/chat/dao/chat-attachments";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface DbRow {
  contentHash: string | null;
  parsedStructured: ResumeParserStructured | null;
  storageKey: string;
  [key: string]: unknown;
}

interface WhereCondition {
  matches: (row: DbRow) => boolean;
}

// 共享内存行存储，beforeEach 重置 / Shared in-memory store, reset in beforeEach.
const rows: DbRow[] = [];

vi.mock("@arc/backend/lib/server/db", () => ({
  db: {
    // update(table).set(patch).where(cond) — 对所有匹配行原地应用 patch。
    // update(table).set(patch).where(cond) — apply patch to every matching row in place.
    update: (_table: unknown) => ({
      set: (patch: Partial<DbRow>) => ({
        where: (condition: WhereCondition) => {
          for (const row of rows) {
            if (condition.matches(row)) {
              Object.assign(row, patch);
            }
          }
        },
      }),
    }),
  },
}));

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
  isNull: (col: { name: string }) => ({
    matches: (row: DbRow) => row[col.name] === null || row[col.name] === undefined,
  }),
  ne: (col: { name: string }, value: unknown) => ({
    matches: (row: DbRow) => row[col.name] !== value,
  }),
}));

vi.mock("@arc/db-schema/schema", () => ({
  chatAttachment: {
    contentHash: { name: "contentHash" },
    parsedStructured: { name: "parsedStructured" },
  },
}));

// 一份最小合法结构化数据，能通过 structuredSchema.safeParse。
// Minimal valid structured payload that passes structuredSchema.safeParse.
const VALID_STRUCTURED: ResumeParserStructured = {
  age: null,
  degree: null,
  education: null,
  email: null,
  gender: null,
  graduationYear: null,
  links: [],
  major: null,
  name: "郭靖",
  personalStrengths: [],
  phone: null,
  projectExperiences: [],
  schools: [],
  skills: [],
  targetRoles: [],
  timelineSummary: {
    currentStatus: null,
    dateRanges: [],
    estimatedExperienceYears: null,
    riskSignals: [],
  },
  workExperiences: [],
  workYears: null,
};

function insertFakeRow(
  hash: string,
  storageKey: string,
  parsedStructured: ResumeParserStructured | null,
) {
  rows.push({ contentHash: hash, parsedStructured, storageKey });
}

describe("updateStructuredByHash", () => {
  beforeEach(() => {
    rows.length = 0;
  });

  it("backfills a row that had parsedStructured = null", async () => {
    insertFakeRow("a".repeat(64), "chat-attachments/a.pdf", null);

    await updateStructuredByHash("a".repeat(64), VALID_STRUCTURED);

    expect(rows[0]?.parsedStructured?.name).toBe("郭靖");
  });

  it("spreads to ALL rows sharing the same hash (multi-user scenario)", async () => {
    insertFakeRow("b".repeat(64), "chat-attachments/b.pdf", null);
    insertFakeRow("b".repeat(64), "chat-attachments/b.pdf", null);
    insertFakeRow("b".repeat(64), "chat-attachments/b.pdf", null);

    await updateStructuredByHash("b".repeat(64), VALID_STRUCTURED);

    for (const row of rows) {
      expect(row.parsedStructured?.name).toBe("郭靖");
    }
  });

  it("is idempotent: rows that already have parsedStructured are left untouched", async () => {
    const preExisting: ResumeParserStructured = { ...VALID_STRUCTURED, name: "老的" };
    insertFakeRow("c".repeat(64), "chat-attachments/c.pdf", preExisting);
    insertFakeRow("c".repeat(64), "chat-attachments/c.pdf", null);

    await updateStructuredByHash("c".repeat(64), VALID_STRUCTURED);

    // 老的那行保持不变 / pre-existing row unchanged
    expect(rows[0]?.parsedStructured?.name).toBe("老的");
    // null 的那行被回填 / null row got backfilled
    expect(rows[1]?.parsedStructured?.name).toBe("郭靖");
  });

  it("does not touch rows with a different hash", async () => {
    insertFakeRow("d".repeat(64), "chat-attachments/d.pdf", null);
    insertFakeRow("e".repeat(64), "chat-attachments/e.pdf", null);

    await updateStructuredByHash("d".repeat(64), VALID_STRUCTURED);

    expect(rows[0]?.parsedStructured?.name).toBe("郭靖");
    expect(rows[1]?.parsedStructured).toBeNull();
  });

  it("silently noop's when the input fails schema validation", async () => {
    insertFakeRow("f".repeat(64), "chat-attachments/f.pdf", null);

    // 缺少必填字段的脏数据 / malformed payload missing required fields
    const malformed = { name: "incomplete" } as unknown as ResumeParserStructured;

    // 静音 sanitizeParsedStructured 内部的 console.warn / suppress its warning
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await updateStructuredByHash("f".repeat(64), malformed);

    expect(rows[0]?.parsedStructured).toBeNull();
    warnSpy.mockRestore();
  });
});
