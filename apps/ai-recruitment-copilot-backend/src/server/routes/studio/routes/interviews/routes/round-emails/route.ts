// round-emails 子路由：POST /:roundId/send 发送邀请邮件，GET /summary 查询发送摘要。
// round-emails subrouter: POST /:roundId/send sends invite email, GET /summary queries send summary.

import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  buildSenderFromAddress,
  getResendClient,
} from "@arc/ai-recruitment-copilot-backend/lib/server/resend";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import { getGlobalConfig } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/global-config/dao";
import {
  insertRoundEmailLog,
  summarizeRoundEmailLogs,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/routes/round-emails/dao";
import { renderRoundInviteEmail } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/routes/round-emails/utils/templates";
import type { SendRoundEmailResponse } from "@arc/db-schema/round-email-log";
import { summaryQuerySchema } from "@arc/db-schema/round-email-log";
import { studioInterview, studioInterviewSchedule } from "@arc/db-schema/schema";

const sendParamsSchema = z.object({ roundId: z.string().min(1) });

type SendEmailInput = Parameters<ReturnType<typeof getResendClient>["emails"]["send"]>[0];
type SendEmailResult = Awaited<ReturnType<ReturnType<typeof getResendClient>["emails"]["send"]>>;

export interface RoundEmailsRouterDependencies {
  buildSenderFromAddress: typeof buildSenderFromAddress;
  requirePermission: typeof requirePermission;
  sendEmail: (input: SendEmailInput) => Promise<SendEmailResult>;
}

const defaultDependencies: RoundEmailsRouterDependencies = {
  buildSenderFromAddress,
  requirePermission,
  sendEmail: (input) => getResendClient().emails.send(input),
};

// NEXT_PUBLIC_BASE_URL 未配置时抛出明确错误。
// Throws a clear error when NEXT_PUBLIC_BASE_URL is not configured.
function getAppUrl(): string {
  const v = process.env.NEXT_PUBLIC_BASE_URL;
  if (!v) {
    throw new Error("NEXT_PUBLIC_BASE_URL 未配置");
  }
  return v.replace(/\/$/, "");
}

export function createRoundEmailsRouter(
  dependencies: RoundEmailsRouterDependencies = defaultDependencies,
) {
  return factory
    .createApp()
    .post(
      "/:roundId/send",
      dependencies.requirePermission("interview", "update"),
      zValidator("param", sendParamsSchema, jsonValidatorError("参数错误")),
      async (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg) {
          return c.json({ error: "Unauthorized" }, 401);
        }
        const { roundId } = c.req.valid("param");

        // 联查轮次 + 候选人邮箱 + pipelineStage（用于阶段守卫）。
        // Join round with candidate email + pipelineStage for the stage guard.
        const [row] = await db
          .select({
            candidateEmail: studioInterview.candidateEmail,
            candidateName: studioInterview.candidateName,
            interviewRecordId: studioInterviewSchedule.interviewRecordId,
            pipelineStage: studioInterview.pipelineStage,
            roundLabel: studioInterviewSchedule.roundLabel,
            scheduledAt: studioInterviewSchedule.scheduledAt,
          })
          .from(studioInterviewSchedule)
          .innerJoin(
            studioInterview,
            eq(studioInterview.id, studioInterviewSchedule.interviewRecordId),
          )
          .where(
            and(
              eq(studioInterviewSchedule.id, roundId),
              eq(studioInterviewSchedule.organizationId, activeOrg.id),
            ),
          )
          .limit(1);

        if (!row) {
          return c.json({ error: "面试轮次不存在" }, 404);
        }
        // 候选人已超过 AI 面试阶段后禁止发送 AI 面试邀请邮件。
        // UI 端已禁用按钮（aiStageLockedReason）；这里是服务端兜底，防止绕过 UI 调用。
        // Reject sending AI interview invites once the candidate has moved past
        // the AI stage. The UI already disables the button — this is the
        // server-side guard preventing direct API calls.
        if (row.pipelineStage !== "screening" && row.pipelineStage !== "ai_interview") {
          return c.json(
            {
              error:
                "候选人已不在 AI 面试阶段，无法发送邀请邮件。如需重新发送，请先回退阶段或重新激活。",
            },
            409,
          );
        }
        if (!row.candidateEmail) {
          return c.json({ error: "候选人邮箱未填写" }, 400);
        }

        const interviewUrl = `${getAppUrl()}/interview/${row.interviewRecordId}/${roundId}`;
        // 中文：从上下文设置里读公司名称作为标题/正文前缀；为空时模板会回退到「AI 面试」。
        // English: Pull companyName from global config as subject/body prefix;
        // template falls back to "AI 面试" when blank.
        const config = await getGlobalConfig(activeOrg.id);
        const { html, subject, text } = await renderRoundInviteEmail({
          candidateName: row.candidateName,
          companyName: config.companyName,
          heroImageUrl: `${getAppUrl()}/email/interview-clouds-monet.jpg`,
          interviewUrl,
          roundLabel: row.roundLabel,
          scheduledAt: row.scheduledAt,
        });

        let sendResult: Awaited<ReturnType<ReturnType<typeof getResendClient>["emails"]["send"]>>;
        try {
          const from = dependencies.buildSenderFromAddress(config.companyName);
          sendResult = await dependencies.sendEmail({
            from,
            html,
            subject,
            text,
            to: row.candidateEmail,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Resend 调用异常";
          console.error("[round-email] send failed", {
            error: message,
            organizationId: activeOrg.id,
            roundId,
          });
          const log = await insertRoundEmailLog({
            errorMessage: message,
            interviewRecordId: row.interviewRecordId,
            organizationId: activeOrg.id,
            resendMessageId: null,
            roundId,
            sentBy: user?.id ?? null,
            status: "failed",
            subject,
            toEmail: row.candidateEmail,
          });
          return c.json({ error: "邮件发送失败，请稍后重试。", logId: log.id }, 500);
        }

        // Resend 返回错误时写入 failed 日志并返回 400。
        // On Resend error: write a failed log and return 400.
        if (sendResult.error || !sendResult.data) {
          const message = sendResult.error?.message ?? "Resend 未返回 message id";
          console.error("[round-email] send failed", {
            error: message,
            organizationId: activeOrg.id,
            roundId,
          });
          const log = await insertRoundEmailLog({
            errorMessage: message,
            interviewRecordId: row.interviewRecordId,
            organizationId: activeOrg.id,
            resendMessageId: null,
            roundId,
            sentBy: user?.id ?? null,
            status: "failed",
            subject,
            toEmail: row.candidateEmail,
          });
          return c.json({ error: `邮件发送失败：${message}`, logId: log.id }, 400);
        }

        const log = await insertRoundEmailLog({
          errorMessage: null,
          interviewRecordId: row.interviewRecordId,
          organizationId: activeOrg.id,
          resendMessageId: sendResult.data.id,
          roundId,
          sentBy: user?.id ?? null,
          status: "sent",
          subject,
          toEmail: row.candidateEmail,
        });

        const response: SendRoundEmailResponse = {
          logId: log.id,
          sentAt: log.createdAt,
          toEmail: row.candidateEmail,
        };
        return c.json(response, 200);
      },
    )
    .get(
      "/summary",
      dependencies.requirePermission("interview", "read"),
      zValidator("query", summaryQuerySchema, jsonValidatorError("缺少 roundIds")),
      async (c) => {
        const { activeOrg } = c.var;
        if (!activeOrg) {
          return c.json({ error: "Unauthorized" }, 401);
        }
        const { roundIds } = c.req.valid("query");
        const summary = await summarizeRoundEmailLogs(activeOrg.id, roundIds);
        return c.json(summary, 200);
      },
    );
}

export const roundEmailsRouter = createRoundEmailsRouter();

export type RoundEmailsRouter = typeof roundEmailsRouter;
