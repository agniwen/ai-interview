import {
  interviewNotificationPayloadSnapshotSchema,
  interviewNotificationTemplateVariableSchema,
} from "@arc/db-schema/interview-notifications";
import type {
  InterviewNotificationEventType,
  InterviewNotificationPayloadSnapshot,
  InterviewNotificationTemplateVariable,
} from "@arc/db-schema/interview-notifications";

export {
  aiInvitationExceptionTypeSchema,
  aiInvitationExceptionTypeValues,
  candidateInterviewInvitationStatusSchema,
  candidateInterviewInvitationStatusValues,
  interviewNotificationAudienceTypeSchema,
  interviewNotificationAudienceTypeValues,
  interviewNotificationChannelSchema,
  interviewNotificationChannelValues,
  interviewNotificationDeliveryStatusSchema,
  interviewNotificationDeliveryStatusValues,
  interviewNotificationEventStatusSchema,
  interviewNotificationEventStatusValues,
  interviewNotificationEventTypeSchema,
  interviewNotificationEventTypeValues,
  interviewNotificationPayloadSnapshotSchema,
  interviewNotificationScopeTypeSchema,
  interviewNotificationScopeTypeValues,
  interviewNotificationTemplateStatusSchema,
  interviewNotificationTemplateStatusValues,
  interviewNotificationTemplateVariableSchema,
  interviewNotificationTemplateVariableValues,
} from "@arc/db-schema/interview-notifications";
export type {
  AiInvitationExceptionType,
  CandidateInterviewInvitationStatus,
  InterviewNotificationAudienceType,
  InterviewNotificationChannel,
  InterviewNotificationDeliveryStatus,
  InterviewNotificationEventStatus,
  InterviewNotificationEventType,
  InterviewNotificationPayloadSnapshot,
  InterviewNotificationScopeType,
  InterviewNotificationTemplateStatus,
  InterviewNotificationTemplateVariable,
} from "@arc/db-schema/interview-notifications";

export const INTERVIEW_NOTIFICATION_RETRY_DELAYS_MS = [60_000, 300_000, 900_000] as const;

export function getInterviewNotificationRetryAt(
  failedAttemptCount: number,
  now: Date = new Date(),
): Date | null {
  const delay = INTERVIEW_NOTIFICATION_RETRY_DELAYS_MS[failedAttemptCount - 1];
  return delay === undefined ? null : new Date(now.getTime() + delay);
}

export function buildInterviewNotificationDedupeKey(input: {
  discriminator?: string | number;
  scopeId: string;
  type: InterviewNotificationEventType;
  version: number;
}): string {
  const parts = [input.type, input.scopeId.trim(), String(input.version)];
  if (input.discriminator !== undefined) {
    parts.push(String(input.discriminator).trim());
  }
  if (!parts.every(Boolean) || !Number.isInteger(input.version) || input.version < 1) {
    throw new Error("通知去重键参数无效。");
  }
  return parts.join(":");
}

const TEMPLATE_VARIABLE_PATTERN = /{{\s*([^{}]+?)\s*}}/g;

export function extractInterviewNotificationTemplateVariables(
  ...templates: (string | null | undefined)[]
): InterviewNotificationTemplateVariable[] {
  const variables = new Set<InterviewNotificationTemplateVariable>();
  for (const template of templates) {
    if (!template) {
      continue;
    }
    for (const match of template.matchAll(TEMPLATE_VARIABLE_PATTERN)) {
      const variable = match[1]?.trim();
      const parsed = interviewNotificationTemplateVariableSchema.safeParse(variable);
      if (!parsed.success) {
        throw new Error(`通知模板包含不支持的变量：${variable}`);
      }
      variables.add(parsed.data);
    }
  }
  return [...variables].toSorted();
}

type InterviewNotificationTemplateValue = number | string | string[] | null | undefined;

function formatTemplateValue(value: InterviewNotificationTemplateValue): string {
  if (Array.isArray(value)) {
    return value.join("、");
  }
  return value === undefined || value === null ? "" : String(value);
}

const DATE_TIME_TEMPLATE_VARIABLES = new Set<InterviewNotificationTemplateVariable>([
  "deadline",
  "completedAt",
  "interviewEndTime",
  "interviewStartTime",
  "invitationEndTime",
  "invitationStartTime",
  "oldInterviewEndTime",
  "oldInterviewStartTime",
  "occurredAt",
  "responseTime",
]);

export function formatInterviewNotificationDateTime(
  value: string | null | undefined,
  timeZone: string,
): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return value ?? "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const parts = new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "numeric",
    timeZone,
    weekday: "short",
    year: "numeric",
  }).formatToParts(date);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${valueOf("year")}年${valueOf("month")}月${valueOf("day")}日（${valueOf(
    "weekday",
  )}）${valueOf("hour")}:${valueOf("minute")}`;
}

export function renderInterviewNotificationTemplate(
  template: string,
  rawPayload: InterviewNotificationPayloadSnapshot,
): string {
  const payload = interviewNotificationPayloadSnapshotSchema.parse(rawPayload);
  extractInterviewNotificationTemplateVariables(template);
  return template.replaceAll(TEMPLATE_VARIABLE_PATTERN, (_match, rawVariable: string) => {
    const variable = interviewNotificationTemplateVariableSchema.parse(rawVariable.trim());
    if (DATE_TIME_TEMPLATE_VARIABLES.has(variable)) {
      // SAFETY: DATE_TIME_TEMPLATE_VARIABLES contains only scalar date-time keys
      // from InterviewNotificationPayloadSnapshot, never array-valued keys.
      return formatInterviewNotificationDateTime(
        payload[variable] as string | null | undefined,
        payload.timeZone,
      );
    }
    return formatTemplateValue(payload[variable]);
  });
}

export type InterviewNotificationFailureKind = "permanent" | "retryable" | "unknown";

export interface InterviewNotificationFailure {
  code: string;
  kind: InterviewNotificationFailureKind;
  message: string;
}

export class InterviewNotificationProviderError extends Error {
  readonly code: string;
  readonly kind: InterviewNotificationFailureKind;

  constructor(input: {
    cause?: unknown;
    code: string;
    kind: InterviewNotificationFailureKind;
    message: string;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "InterviewNotificationProviderError";
    this.code = input.code;
    this.kind = input.kind;
  }
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Provider catch boundaries produce unknown errors by design.
export function classifyInterviewNotificationFailure(error: unknown): InterviewNotificationFailure {
  if (error instanceof InterviewNotificationProviderError) {
    return { code: error.code, kind: error.kind, message: error.message };
  }
  return {
    code: "provider-result-unknown",
    kind: "unknown",
    message: error instanceof Error ? error.message : "通知供应商返回结果未知。",
  };
}
