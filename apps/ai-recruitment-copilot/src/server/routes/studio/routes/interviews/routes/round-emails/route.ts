// round-emails 子路由：POST /:roundId/send 发送邀请邮件，GET /summary 查询发送摘要。
// round-emails subrouter: POST /:roundId/send sends invite email, GET /summary queries send summary.

import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { getResendClient, getResendFrom } from "@/lib/server/resend";
import { factory, jsonValidatorError } from "@/server/factory";
import { requirePermission } from "@/server/middlewares/permission";
import { getGlobalConfig } from "@/server/routes/studio/routes/global-config/dao";
import {
  insertRoundEmailLog,
  summarizeRoundEmailLogs,
} from "@/server/routes/studio/routes/interviews/routes/round-emails/dao";
import { renderRoundInviteEmail } from "@/server/routes/studio/routes/interviews/routes/round-emails/utils/templates";
import type { SendRoundEmailResponse } from "@arc/db-schema/round-email-log";
import { summaryQuerySchema } from "@arc/db-schema/round-email-log";
import { studioInterview, studioInterviewSchedule } from "@arc/db-schema/schema";

const sendParamsSchema = z.object({ roundId: z.string().min(1) });

// NEXT_PUBLIC_PUBLIC_URL 未配置时抛出明确错误。
// Throws a clear error when NEXT_PUBLIC_PUBLIC_URL is not configured.
function getAppUrl(): string {
  const v = process.env.NEXT_PUBLIC_PUBLIC_URL;
  if (!v) {
    throw new Error("NEXT_PUBLIC_PUBLIC_URL 未配置");
  }
  return v.replace(/\/$/, "");
}

export const roundEmailsRouter = factory
  .createApp()
  .post(
    "/:roundId/send",
    requirePermission("interview", "update"),
    zValidator("param", sendParamsSchema, jsonValidatorError("参数错误")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      const { roundId } = c.req.valid("param");

      // 联查轮次 + 候选人邮箱。/ Join round with candidate email.
      const [row] = await db
        .select({
          candidateEmail: studioInterview.candidateEmail,
          candidateName: studioInterview.candidateName,
          interviewRecordId: studioInterviewSchedule.interviewRecordId,
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
      if (!row.candidateEmail) {
        return c.json({ error: "候选人邮箱未填写" }, 400);
      }

      const interviewUrl = `${getAppUrl()}/interview/${row.interviewRecordId}/${roundId}`;
      // 中文：从系统设置里读公司名称作为标题/正文前缀；为空时模板会回退到「AI 面试」。
      // English: Pull companyName from global config as subject/body prefix;
      // template falls back to "AI 面试" when blank.
      const config = await getGlobalConfig(activeOrg.id);
      const { html, subject, text } = await renderRoundInviteEmail({
        candidateName: row.candidateName,
        companyName: config.companyName,
        interviewUrl,
        roundLabel: row.roundLabel,
        scheduledAt: row.scheduledAt,
      });

      let sendResult: Awaited<ReturnType<ReturnType<typeof getResendClient>["emails"]["send"]>>;
      try {
        const resend = getResendClient();
        const from = getResendFrom();
        sendResult = await resend.emails.send({
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
        return c.json({ error: `邮件发送失败：${message}`, logId: log.id }, 500);
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
    requirePermission("interview", "read"),
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

export type RoundEmailsRouter = typeof roundEmailsRouter;
