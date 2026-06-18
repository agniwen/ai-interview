/**
 * 集中存放数据库列里以字符串字面量联合方式定义的"轻量级枚举"。
 * 每组以 `as const` 数组为单一来源，配套 `z.enum` 和 `z.infer` 类型。
 * Drizzle 通过 `.$type<XxxValue>()` 引用，避免列声明里散落"pending"/"ready"
 * 这种字符串字面量、又能跟 zod 校验保持一致。
 *
 * Centralized "lightweight enums" for DB columns whose Postgres type is
 * `text` but the application semantics is a string literal union. Each group
 * lives as a single `as const` array, paired with a Zod schema and an
 * inferred TS type. Drizzle picks them up via `.$type<XxxValue>()`, so the
 * column declarations no longer carry inline `"pending" | "ready" | ...`
 * literals that drift from the Zod side.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// 简历附件解析
// Resume attachment parse pipeline
// ---------------------------------------------------------------------------

export const attachmentParseStatusValues = ["pending", "ready", "failed"] as const;
export const attachmentParseStatusSchema = z.enum(attachmentParseStatusValues);
export type AttachmentParseStatus = z.infer<typeof attachmentParseStatusSchema>;

export const attachmentTextSourceValues = [
  "pdf-parse",
  "qwen-ocr",
  "docx-text",
  "html-text",
  "pptx-text",
  "xlsx-text",
] as const;
export const attachmentTextSourceSchema = z.enum(attachmentTextSourceValues);
export type AttachmentTextSource = z.infer<typeof attachmentTextSourceSchema>;

// ---------------------------------------------------------------------------
// 面试会话/录制
// Interview conversation + recording lifecycle
// ---------------------------------------------------------------------------

export const interviewMessageRoleValues = ["agent", "user"] as const;
export const interviewMessageRoleSchema = z.enum(interviewMessageRoleValues);
export type InterviewMessageRole = z.infer<typeof interviewMessageRoleSchema>;

export const interviewRecordingStatusValues = ["pending", "active", "completed", "failed"] as const;
export const interviewRecordingStatusSchema = z.enum(interviewRecordingStatusValues);
export type InterviewRecordingStatus = z.infer<typeof interviewRecordingStatusSchema>;

export const interviewSummaryStatusValues = ["pending", "running", "ready", "failed"] as const;
export const interviewSummaryStatusSchema = z.enum(interviewSummaryStatusValues);
export type InterviewSummaryStatus = z.infer<typeof interviewSummaryStatusSchema>;

// ---------------------------------------------------------------------------
// 通知 / agent notifications
// ---------------------------------------------------------------------------

export const agentNotificationStatusValues = ["pending", "sent", "failed"] as const;
export const agentNotificationStatusSchema = z.enum(agentNotificationStatusValues);
export type AgentNotificationStatus = z.infer<typeof agentNotificationStatusSchema>;

export const agentNotificationTypeValues = ["summary_ready"] as const;
export const agentNotificationTypeSchema = z.enum(agentNotificationTypeValues);
export type AgentNotificationType = z.infer<typeof agentNotificationTypeSchema>;
