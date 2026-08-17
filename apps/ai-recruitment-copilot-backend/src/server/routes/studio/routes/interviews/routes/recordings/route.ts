import { and, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { presignRecordingGetObjectUrl } from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import { resolveRecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { createInternalErrorResponse } from "@arc/ai-recruitment-copilot-backend/server/error-handler";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import { resolveCandidateIdForRound } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/interview-rounds";
import { interviewConversation } from "@arc/db-schema/schema";

interface RecordingRow {
  recordingFileKey: string | null;
  recordingStatus: string | null;
  scheduleEntryId: string | null;
}

export interface RecordingsRouterDependencies {
  loadConversation(input: {
    conversationId: string;
    organizationId: string;
  }): Promise<RecordingRow | null>;
  presignRecording: typeof presignRecordingGetObjectUrl;
  requireReadPermission: ReturnType<typeof requirePermission<"interview">>;
  resolveCandidateId: typeof resolveCandidateIdForRound;
}

const defaultDependencies: RecordingsRouterDependencies = {
  async loadConversation(input) {
    const [conversation] = await db
      .select({
        recordingFileKey: interviewConversation.recordingFileKey,
        recordingStatus: interviewConversation.recordingStatus,
        scheduleEntryId: interviewConversation.scheduleEntryId,
      })
      .from(interviewConversation)
      .where(
        and(
          eq(interviewConversation.conversationId, input.conversationId),
          eq(interviewConversation.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    return conversation ?? null;
  },
  presignRecording: presignRecordingGetObjectUrl,
  requireReadPermission: requirePermission("interview", "read"),
  resolveCandidateId: resolveCandidateIdForRound,
};

export function createRecordingsRouter(overrides: Partial<RecordingsRouterDependencies> = {}) {
  const dependencies: RecordingsRouterDependencies = { ...defaultDependencies, ...overrides };
  return factory
    .createApp()
    .get("/:conversationId", dependencies.requireReadPermission, async (c) => {
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
      const visibilityScope = c.var.user?.id
        ? await resolveRecruitingVisibilityScope({
            currentRole: c.var.member?.role,
            organizationId: activeOrg.id,
            userId: c.var.user.id,
          })
        : { kind: "none" as const };
      const candidateId = await dependencies.resolveCandidateId(
        roundId,
        activeOrg.id,
        visibilityScope,
      );
      if (!candidateId) {
        return c.json({ error: "记录不存在。" }, 404);
      }

      const conversation = await dependencies.loadConversation({
        conversationId,
        organizationId: activeOrg.id,
      });

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
        const url = await dependencies.presignRecording(conversation.recordingFileKey, 600);
        return c.json({ expiresInSeconds: 600, url }, 200);
      } catch (error) {
        return c.json(
          createInternalErrorResponse({
            context: { conversationId, organizationId: activeOrg.id, roundId },
            error,
            operation: "studio-recording-presign",
            publicMessage: "无法生成录像访问链接。",
          }),
          500,
        );
      }
    });
}

export const recordingsRouter = createRecordingsRouter();
