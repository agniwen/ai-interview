import { buildSenderFromAddress, getResendClient } from "../../../lib/server/resend";
import type {
  InterviewNotificationAudienceType,
  InterviewNotificationChannel,
  InterviewNotificationEventType,
  InterviewNotificationPayloadSnapshot,
} from "@arc/db-schema/interview-notifications";
import { InterviewNotificationProviderError } from "@arc/shared/interview-notifications";
import { FEISHU_PROVIDER_IDS } from "../../integrations/feishu/provider";
import type { FeishuProviderId } from "../../integrations/feishu/provider";
import { z } from "zod";
import {
  InterviewNotificationCard,
  renderInterviewNotificationEmailHtml,
} from "./notification-presentation";

export interface SendInterviewNotificationInput {
  address: string;
  audienceType: InterviewNotificationAudienceType;
  channel: InterviewNotificationChannel;
  idempotencyKey: string;
  providerId: string;
  payload: InterviewNotificationPayloadSnapshot;
  renderedContent: string;
  renderedSubject: string | null;
  type: InterviewNotificationEventType;
}

function isFeishuProviderId(value: string): value is FeishuProviderId {
  return FEISHU_PROVIDER_IDS.some((providerId) => providerId === value);
}

const feishuProviderErrorSchema = z.object({ code: z.string() });

function feishuFailureKind(code: string): "permanent" | "retryable" | "unknown" {
  if (code === "rate_limited") {
    return "retryable";
  }
  if (code === "send_timeout" || code === "unknown") {
    return "unknown";
  }
  return "permanent";
}

function resendFailure(error: {
  message?: string;
  name?: string;
}): InterviewNotificationProviderError {
  const code = error.name ?? "resend-error";
  const retryable = [
    "application_error",
    "concurrent_idempotent_requests",
    "internal_server_error",
    "rate_limit_exceeded",
  ].includes(code);
  return new InterviewNotificationProviderError({
    code: `resend-${code}`,
    kind: retryable ? "retryable" : "permanent",
    message: error.message ?? "邮件供应商发送失败。",
  });
}

async function sendEmail(input: SendInterviewNotificationInput) {
  if (!input.renderedSubject?.trim()) {
    throw new InterviewNotificationProviderError({
      code: "email-subject-missing",
      kind: "permanent",
      message: "邮件通知缺少主题。",
    });
  }
  let result: Awaited<ReturnType<ReturnType<typeof getResendClient>["emails"]["send"]>>;
  try {
    result = await getResendClient().emails.send(
      {
        from: buildSenderFromAddress(input.payload.companyName),
        html: renderInterviewNotificationEmailHtml(input),
        subject: input.renderedSubject,
        text: input.renderedContent,
        to: input.address,
      },
      { idempotencyKey: input.idempotencyKey },
    );
  } catch (error) {
    throw new InterviewNotificationProviderError({
      cause: error,
      code: "resend-request-failed",
      kind: "unknown",
      message: "邮件请求结果未知，需要人工核查。",
    });
  }
  if (result.error) {
    throw resendFailure(result.error);
  }
  if (!result.data?.id) {
    throw new InterviewNotificationProviderError({
      code: "resend-result-missing",
      kind: "unknown",
      message: "邮件供应商未返回消息 ID，需要人工核查。",
    });
  }
  return { providerMessageId: result.data.id };
}

async function sendFeishu(input: SendInterviewNotificationInput) {
  if (!isFeishuProviderId(input.providerId)) {
    throw new InterviewNotificationProviderError({
      code: "feishu-provider-invalid",
      kind: "permanent",
      message: "飞书通知供应商配置无效。",
    });
  }
  try {
    const { postFeishuDirectCard } = await import("../../integrations/feishu/bot");
    const result = await postFeishuDirectCard(
      input.providerId,
      input.address,
      InterviewNotificationCard(input),
    );
    if (!result.id) {
      throw new Error("飞书卡片发送失败且未返回消息 ID。");
    }
    return { providerMessageId: result.id };
  } catch (error) {
    const parsedError = feishuProviderErrorSchema.safeParse(error);
    const providerCode = parsedError.success ? parsedError.data.code : "unknown";
    throw new InterviewNotificationProviderError({
      cause: error,
      code: `feishu-${providerCode}`,
      kind: feishuFailureKind(providerCode),
      message: error instanceof Error ? error.message : "飞书消息发送失败。",
    });
  }
}

export function sendInterviewNotification(input: SendInterviewNotificationInput) {
  if (input.channel === "email") {
    return sendEmail(input);
  }
  if (input.channel === "feishu") {
    return sendFeishu(input);
  }
  throw new InterviewNotificationProviderError({
    code: "sms-provider-not-configured",
    kind: "permanent",
    message: "短信供应商尚未配置。",
  });
}
