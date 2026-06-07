import { and, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { presignRecordingGetObjectUrl } from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import { resolveCandidateIdForRound } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/interview-rounds";
import { interviewConversation } from "@arc/db-schema/schema";

export const recordingsRouter = factory
  .createApp()
  .get("/:conversationId", requirePermission("interview", "read"), async (c) => {
    // `:id` 为 roundId；返回该轮面试录像的 S3 预签名播放 URL (10 分钟有效).
    // `:id` is roundId; return a 10-min presigned URL for the round's recording mp4.
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    // roundId = scheduleEntryId
    const roundId = c.req.param("id");
    if (!roundId) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const conversationId = c.req.param("conversationId");

    // 通过解析 candidateId 验证 org 归属。
    // Validate org scope via candidateId resolution.
    const candidateId = await resolveCandidateIdForRound(roundId, activeOrg.id);
    if (!candidateId) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    const [conversation] = await db
      .select({
        recordingFileKey: interviewConversation.recordingFileKey,
        recordingStatus: interviewConversation.recordingStatus,
        scheduleEntryId: interviewConversation.scheduleEntryId,
      })
      .from(interviewConversation)
      .where(
        and(
          eq(interviewConversation.conversationId, conversationId),
          eq(interviewConversation.organizationId, activeOrg.id),
        ),
      )
      .limit(1);

    // 防止跨轮次访问: conversation 必须属于当前 roundId (scheduleEntryId)。
    // Prevent cross-round access: the conversation must belong to this roundId.
    if (!conversation || conversation.scheduleEntryId !== roundId) {
      return c.json({ error: "未找到该轮录像。" }, 404);
    }
    if (!conversation.recordingFileKey) {
      return c.json({ error: "本轮面试没有录像文件。" }, 404);
    }
    if (conversation.recordingStatus !== "completed") {
      return c.json(
        {
          error: "录像尚未生成完成, 请稍后再试。",
          status: conversation.recordingStatus ?? "unknown",
        },
        409,
      );
    }

    try {
      const url = await presignRecordingGetObjectUrl(conversation.recordingFileKey, 600);
      return c.json({ expiresInSeconds: 600, url }, 200);
    } catch (error) {
      return c.json(
        {
          detail: error instanceof Error ? error.message : "Unknown error",
          error: "无法生成录像访问链接。",
        },
        500,
      );
    }
  });
