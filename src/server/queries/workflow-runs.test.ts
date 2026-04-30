import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { chatConversation, user } from "@/lib/db/schema";
import {
  claimActiveWorkflowRunId,
  clearActiveWorkflowRunId,
  findConversationByActiveRunId,
  getActiveWorkflowRunId,
} from "./workflow-runs";

describe("workflow-runs queries", () => {
  let userId: string;
  let conversationId: string;

  beforeEach(async () => {
    userId = `test-user-${nanoid(8)}`;
    conversationId = `test-conv-${nanoid(8)}`;
    await db.insert(user).values({
      createdAt: new Date(),
      email: `${userId}@test.local`,
      emailVerified: false,
      id: userId,
      name: "Test User",
      updatedAt: new Date(),
    });
    await db.insert(chatConversation).values({
      id: conversationId,
      title: "test",
      userId,
    });
  });

  afterEach(async () => {
    await db.delete(chatConversation).where(eq(chatConversation.id, conversationId));
    await db.delete(user).where(eq(user.id, userId));
  });

  describe("claimActiveWorkflowRunId", () => {
    it("claims when column is NULL", async () => {
      const ok = await claimActiveWorkflowRunId(conversationId, "run-A");
      expect(ok).toBe(true);
      expect(await getActiveWorkflowRunId(conversationId)).toBe("run-A");
    });

    it("is idempotent — same runId can re-claim", async () => {
      await claimActiveWorkflowRunId(conversationId, "run-A");
      const ok = await claimActiveWorkflowRunId(conversationId, "run-A");
      expect(ok).toBe(true);
    });

    it("rejects when a different runId already owns the conversation", async () => {
      await claimActiveWorkflowRunId(conversationId, "run-A");
      const ok = await claimActiveWorkflowRunId(conversationId, "run-B");
      expect(ok).toBe(false);
      expect(await getActiveWorkflowRunId(conversationId)).toBe("run-A");
    });
  });

  describe("clearActiveWorkflowRunId", () => {
    it("clears unconditionally when no expectedRunId is passed", async () => {
      await claimActiveWorkflowRunId(conversationId, "run-A");
      await clearActiveWorkflowRunId(conversationId);
      expect(await getActiveWorkflowRunId(conversationId)).toBeNull();
    });

    it("CAS-clears only when current matches expectedRunId", async () => {
      await claimActiveWorkflowRunId(conversationId, "run-A");
      await clearActiveWorkflowRunId(conversationId, "run-X");
      expect(await getActiveWorkflowRunId(conversationId)).toBe("run-A");
      await clearActiveWorkflowRunId(conversationId, "run-A");
      expect(await getActiveWorkflowRunId(conversationId)).toBeNull();
    });
  });

  describe("findConversationByActiveRunId", () => {
    it("returns the conversation when runId belongs to the user", async () => {
      await claimActiveWorkflowRunId(conversationId, "run-A");
      const found = await findConversationByActiveRunId("run-A", userId);
      expect(found?.id).toBe(conversationId);
    });

    it("returns null for a runId owned by a different user", async () => {
      await claimActiveWorkflowRunId(conversationId, "run-A");
      const found = await findConversationByActiveRunId("run-A", "someone-else");
      expect(found).toBeNull();
    });

    it("returns null when no conversation has that runId active", async () => {
      const found = await findConversationByActiveRunId("ghost-run", userId);
      expect(found).toBeNull();
    });
  });
});
