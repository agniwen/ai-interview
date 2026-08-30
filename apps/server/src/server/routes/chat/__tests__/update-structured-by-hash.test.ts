// updateStructuredByHash 单测 —— 覆盖回填、跨行扩散、幂等、hash 隔离 4 个场景。
// Unit tests for updateStructuredByHash — backfill, multi-row spread, idempotency, hash isolation.

import type { ResumeParserStructured } from "@arc/db-schema/resume-parser-schema";
import { updateStructuredByHash } from "@app/server/server/routes/chat/dao/chat-attachments";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "@app/server/lib/server/db";
import { chatAttachment, organization, user } from "@arc/db-schema/schema";

const ORG_ID = "chat_structured_hash_test_org";
const USER_ID = "chat_structured_hash_test_user";
let rowSequence = 0;

async function cleanup() {
  await db.delete(chatAttachment).where(eq(chatAttachment.organizationId, ORG_ID));
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.delete(user).where(eq(user.id, USER_ID));
}

beforeAll(async () => {
  await cleanup();
  const now = new Date("2026-08-18T00:00:00.000Z");
  await db.insert(user).values({
    createdAt: now,
    email: "chat-structured-hash@example.com",
    emailVerified: false,
    id: USER_ID,
    name: "Chat Structured Hash",
    updatedAt: now,
  });
  await db.insert(organization).values({
    createdAt: now,
    id: ORG_ID,
    name: "Chat Structured Hash Test",
    slug: "chat-structured-hash-test",
  });
});

beforeEach(async () => {
  rowSequence = 0;
  await db.delete(chatAttachment).where(eq(chatAttachment.organizationId, ORG_ID));
});

afterAll(cleanup);

// 一份最小合法结构化数据，能通过 structuredSchema.safeParse。
// Minimal valid structured payload that passes structuredSchema.safeParse.
const VALID_STRUCTURED: ResumeParserStructured = {
  age: null,
  degree: null,
  education: null,
  educationExperiences: [],
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
  sourceFileName: "resume.pdf",
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

async function insertFakeRow(
  hash: string,
  storageKey: string,
  parsedStructured: ResumeParserStructured | null,
  filename = "resume.pdf",
) {
  rowSequence += 1;
  await db.insert(chatAttachment).values({
    contentHash: hash,
    filename,
    id: `structured-hash-att-${rowSequence}`,
    mediaType: "application/pdf",
    organizationId: ORG_ID,
    parsedStatus: "ready",
    parsedStructured,
    size: 100,
    storageKey,
    userId: USER_ID,
  });
}

async function loadRows() {
  return await db
    .select({ parsedStructured: chatAttachment.parsedStructured })
    .from(chatAttachment)
    .where(eq(chatAttachment.organizationId, ORG_ID))
    .orderBy(asc(chatAttachment.id));
}

describe("updateStructuredByHash", () => {
  it("backfills a row that had parsedStructured = null", async () => {
    await insertFakeRow("a".repeat(64), "chat-attachments/a.pdf", null);

    await updateStructuredByHash("a".repeat(64), VALID_STRUCTURED);

    const rows = await loadRows();
    expect(rows[0]?.parsedStructured?.name).toBe("郭靖");
  });

  it("spreads to ALL rows sharing the same hash (multi-user scenario)", async () => {
    await insertFakeRow("b".repeat(64), "chat-attachments/b.pdf", null);
    await insertFakeRow("b".repeat(64), "chat-attachments/b.pdf", null);
    await insertFakeRow("b".repeat(64), "chat-attachments/b.pdf", null);

    await updateStructuredByHash("b".repeat(64), VALID_STRUCTURED);

    const rows = await loadRows();
    for (const row of rows) {
      expect(row.parsedStructured?.name).toBe("郭靖");
    }
  });

  it("does not spread filename-derived structure to a differently named copy", async () => {
    const hash = "9".repeat(64);
    await insertFakeRow(hash, "chat-attachments/shared.pdf", null, "resume.pdf");
    await insertFakeRow(hash, "chat-attachments/shared.pdf", null, "另一位候选人.pdf");

    await updateStructuredByHash(hash, VALID_STRUCTURED);

    const rows = await loadRows();
    expect(rows[0]?.parsedStructured?.name).toBe("郭靖");
    expect(rows[1]?.parsedStructured).toBeNull();
  });

  it("is idempotent: rows that already have parsedStructured are left untouched", async () => {
    const preExisting: ResumeParserStructured = { ...VALID_STRUCTURED, name: "老的" };
    await insertFakeRow("c".repeat(64), "chat-attachments/c.pdf", preExisting);
    await insertFakeRow("c".repeat(64), "chat-attachments/c.pdf", null);

    await updateStructuredByHash("c".repeat(64), VALID_STRUCTURED);

    const rows = await loadRows();
    // 老的那行保持不变 / pre-existing row unchanged
    expect(rows[0]?.parsedStructured?.name).toBe("老的");
    // null 的那行被回填 / null row got backfilled
    expect(rows[1]?.parsedStructured?.name).toBe("郭靖");
  });

  it("does not touch rows with a different hash", async () => {
    await insertFakeRow("d".repeat(64), "chat-attachments/d.pdf", null);
    await insertFakeRow("e".repeat(64), "chat-attachments/e.pdf", null);

    await updateStructuredByHash("d".repeat(64), VALID_STRUCTURED);

    const rows = await loadRows();
    expect(rows[0]?.parsedStructured?.name).toBe("郭靖");
    expect(rows[1]?.parsedStructured).toBeNull();
  });

  it("silently noop's when the input fails schema validation", async () => {
    await insertFakeRow("f".repeat(64), "chat-attachments/f.pdf", null);

    // 缺少必填字段的脏数据 / malformed payload missing required fields
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const malformed = { name: "incomplete" } as ResumeParserStructured;

    // 静音 sanitizeParsedStructured 内部的 console.warn / suppress its warning
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await updateStructuredByHash("f".repeat(64), malformed);

    const rows = await loadRows();
    expect(rows[0]?.parsedStructured).toBeNull();
    warnSpy.mockRestore();
  });
});
