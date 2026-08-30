import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createInternalErrorResponse } from "@app/server/server/error-handler";
import { factory, jsonValidatorError } from "@app/server/server/factory";
import {
  AiInterviewInvitationError,
  previewAiInterviewInvitation,
  recordAiInterviewInvitationException,
  respondAiInterviewInvitation,
} from "@app/server/server/routes/studio/routes/interviews/dao/ai-interview-candidate-response";
import type { AiInterviewInvitationErrorCode } from "@app/server/server/routes/studio/routes/interviews/dao/ai-interview-candidate-response";

function invitationErrorTitle(code: AiInterviewInvitationErrorCode): string {
  if (code === "response_conflict") {
    return "无法变更确认结果";
  }
  if (code === "invitation_expired") {
    return "面试邀请已过期";
  }
  return "邀请链接无效";
}

export const aiInterviewInvitationsRouter = factory
  .createApp()
  .get("/:token", async (c) => {
    const preview = await previewAiInterviewInvitation(c.req.param("token"));
    if (!preview) {
      return c.json({ error: "AI 面试邀请不存在。" }, 404);
    }
    return c.json(preview, 200);
  })
  .post(
    "/:token/respond",
    zValidator(
      "json",
      z.object({
        action: z.enum(["accept", "decline"]),
        declineReason: z.string().trim().max(500).nullable().optional(),
      }),
      jsonValidatorError("邀请响应无效。"),
    ),
    async (c) => {
      const token = c.req.param("token");
      try {
        const result = await respondAiInterviewInvitation({
          ...c.req.valid("json"),
          token,
        });
        return c.json(result, 200);
      } catch (error) {
        if (error instanceof AiInterviewInvitationError) {
          if (error.code !== "invalid_link") {
            await recordAiInterviewInvitationException({
              exceptionType: error.code,
              token,
            }).catch((notificationError) => {
              console.error("[ai-invitation-exception-notification] failed", {
                error: notificationError,
                exceptionType: error.code,
              });
            });
          }
          return c.json(
            {
              code: error.code,
              error: error.message,
              title: invitationErrorTitle(error.code),
            },
            error.status,
          );
        }
        await recordAiInterviewInvitationException({
          exceptionType: "system_error",
          token,
        }).catch((notificationError) => {
          console.error("[ai-invitation-exception-notification] failed", {
            error: notificationError,
            exceptionType: "system_error",
          });
        });
        const response = createInternalErrorResponse({
          error,
          operation: "respond-ai-interview-invitation",
          publicMessage:
            "暂时无法完成您的面试确认操作，请稍后重新尝试。如果多次尝试仍然失败，请联系招聘负责人协调处理。",
        });
        return c.json({ ...response, code: "system_error", title: "接受面试异常" }, 500);
      }
    },
  );
