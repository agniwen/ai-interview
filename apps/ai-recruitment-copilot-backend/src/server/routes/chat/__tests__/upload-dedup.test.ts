// 简历上传去重 query 层单元测试 —— 覆盖 contentHash 写入与查找 (含失败状态过滤)。
// Unit tests for the chat-attachment dedup query layer — covers contentHash
// persistence and findAttachmentByContentHash (including failed-row exclusion).

import {
  createAttachment,
  findAttachmentByContentHash,
} from "@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat-attachments";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { chatAttachment, organization, user } from "@arc/db-schema/schema";

const ORG_ID = "chat_dedup_test_org";
const USER_ID = "chat_dedup_test_user";

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
    email: "chat-dedup@example.com",
    emailVerified: false,
    id: USER_ID,
    name: "Chat Dedup",
    updatedAt: now,
  });
  await db.insert(organization).values({
    createdAt: now,
    id: ORG_ID,
    name: "Chat Dedup Test",
    slug: "chat-dedup-test",
  });
});

beforeEach(async () => {
  await db.delete(chatAttachment).where(eq(chatAttachment.organizationId, ORG_ID));
});

afterAll(cleanup);

describe("chat-attachment dedup query layer", () => {
  it("createAttachment persists contentHash", async () => {
    const hash = `${ORG_ID}:persisted`;
    await createAttachment({
      contentHash: hash,
      filename: "r.pdf",
      id: "att-1",
      mediaType: "application/pdf",
      organizationId: ORG_ID,
      parsedStatus: "ready",
      parsedText: "hello",
      size: 1234,
      storageKey: "chat-attachments/aaaa.pdf",
      userId: USER_ID,
    });

    const [row] = await db
      .select({ contentHash: chatAttachment.contentHash })
      .from(chatAttachment)
      .where(eq(chatAttachment.id, "att-1"));
    expect(row?.contentHash).toBe(hash);
  });

  it("findAttachmentByContentHash returns the matching ready row", async () => {
    const hash = `${ORG_ID}:ready`;
    await createAttachment({
      contentHash: hash,
      filename: "r.pdf",
      id: "att-2",
      mediaType: "application/pdf",
      organizationId: ORG_ID,
      parsedStatus: "ready",
      size: 100,
      storageKey: "chat-attachments/bbbb.pdf",
      userId: USER_ID,
    });

    const found = await findAttachmentByContentHash(hash);
    expect(found?.storageKey).toBe("chat-attachments/bbbb.pdf");
  });

  it("findAttachmentByContentHash skips rows where parsedStatus is 'failed'", async () => {
    const hash = `${ORG_ID}:failed`;
    await createAttachment({
      contentHash: hash,
      filename: "r.pdf",
      id: "att-3",
      mediaType: "application/pdf",
      organizationId: ORG_ID,
      parsedStatus: "failed",
      size: 100,
      storageKey: "chat-attachments/cccc.pdf",
      userId: USER_ID,
    });

    const found = await findAttachmentByContentHash(hash);
    expect(found).toBeNull();
  });

  it("findAttachmentByContentHash returns null when nothing matches", async () => {
    const found = await findAttachmentByContentHash(`${ORG_ID}:missing`);
    expect(found).toBeNull();
  });
});
