/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type -- 迁移边界按 Drizzle 元数据逐表读取 JSON，保留各代未知 artifact，禁止用当前业务 schema 解析丢弃历史字段。 */
import { createHash } from "node:crypto";
import * as schema from "@app/db-schema";
import { isTable } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import type { PgTable } from "drizzle-orm/pg-core";

export type Row = Record<string, unknown>;
export const tableCopies = {
  candidateFormSubmission: "recruitingFormSubmission",
  humanInterviewDocumentSync: "humanInterviewEvaluationDocumentSync",
  interviewAuditLog: "recruitingEvent",
  interviewContextSnapshot: "recruitingContextSnapshot",
  interviewConversation: "aiInterviewConversation",
  interviewConversationTurn: "aiInterviewConversationTurn",
  interviewEvidenceSnapshot: "recruitingEvidenceSnapshot",
  interviewNotification: "recruitingNotificationDelivery",
  interviewNotificationEvent: "recruitingNotificationEvent",
  interviewQuestionTemplateBinding: "recruitingQuestionTemplateBinding",
  mailIngestMessage: "recruitingMailMessage",
  meetingRecruitingContext: "recruitingMeetingContext",
  resumeDuplicateMatch: "recruitingDuplicateMatch",
  resumeJobMatchCandidate: "recruitingJobMatchCandidate",
  resumeJobMatchRun: "recruitingJobMatchRun",
  resumePoolImport: "recruitingPoolImport",
  resumeSemanticIndex: "recruitingSearchIndex",
  resumeUploadBatch: "recruitingUploadBatch",
  resumeUploadBatchItem: "recruitingUploadBatchItem",
  studioHumanInterviewEvaluationSnapshot: "humanInterviewEvaluationSnapshot",
  studioHumanInterviewMeeting: "humanInterviewMeeting",
  studioHumanInterviewMeetingEvent: "humanInterviewMeetingEvent",
  studioHumanInterviewMeetingInterviewer: "humanInterviewMeetingInterviewer",
  studioHumanInterviewMeetingRound: "humanInterviewMeetingRound",
  studioHumanInterviewRound: "humanInterviewRound",
  studioHumanInterviewRoundInterviewer: "humanInterviewRoundInterviewer",
  studioInterviewNotificationRecipient: "recruitingNotificationRecipient",
  studioInterviewSchedule: "aiInterviewRound",
  studioOfferDraft: "recruitingOffer",
  studioRoundEmailLog: "recruitingRoundEmailLog",
} as const;

export const tables = new Map<string, PgTable>(
  // SAFETY: isTable 已在每次断言前验证 Drizzle 表实例。
  Object.entries(schema).flatMap(([name, value]): [string, PgTable][] =>
    isTable(value) ? [[name, value as PgTable]] : [],
  ),
);
export function table(name: string): PgTable {
  const value = tables.get(name);
  if (!value) {
    throw new Error(`Unknown schema table: ${name}`);
  }
  return value;
}
export function sqlName(name: string): string {
  return getTableConfig(table(name)).name;
}
export const sourceNames = [
  "studioInterview",
  "resumeEvaluationVersion",
  "resumeEvaluationFailure",
  ...Object.keys(tableCopies),
];
export const targetNames = [
  "candidate",
  "candidateResume",
  "recruitingRecord",
  "recruitingResumeEvaluation",
  "recruitingInterviewPreparation",
  "recruitingFulfillment",
  "recruitingMaterial",
  "recruitingNodeState",
  ...Object.values(tableCopies),
];
export function deferredColumns(name: string): string[] {
  if (name === "aiInterviewRound") {
    return ["conversation_id"];
  }
  if (name === "recruitingRecord") {
    return ["current_evaluation_id", "active_evaluation_id"];
  }
  return [];
}

export function canonical(value: unknown): string {
  if (value === undefined) {
    throw new Error("Undefined migration value");
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  return `{${Object.entries(value)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
    .join(",")}}`;
}
export function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export function stableId(kind: string, sourceId: unknown): string {
  return `migrated_${kind}_${digest(sourceId).slice(0, 32)}`;
}
export function key(name: string, row: Row): string {
  const config = getTableConfig(table(name));
  const columns = [
    ...config.columns.filter((c) => c.primary),
    ...config.primaryKeys.flatMap((p) => p.columns),
  ];
  if (columns.length === 0) {
    throw new Error(`Missing primary key: ${name}`);
  }
  return canonical(Object.fromEntries(columns.map((c) => [c.name, row[c.name]])));
}
export function pick(row: Row, columns: string[]): Row {
  return Object.fromEntries(
    columns.filter((column) => row[column] !== undefined).map((column) => [column, row[column]]),
  );
}
export function object(value: unknown): Row {
  // SAFETY: 仅排除非对象和数组，迁移需要保留原始 JSON 对象的全部键。
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}
export function requiredString(value: unknown): string {
  if (typeof value !== "string" || !value) {
    throw new Error("Required migration identifier is missing");
  }
  return value;
}
export interface CopyItem {
  sourceName: string;
  sourceKey: string;
  source: Row;
  targetName: string;
  row: Row;
}
export interface MigrationMapping {
  humanRoundKinds?: Record<string, "second_interview" | "final_interview">;
  recordNodes?: Record<string, schema.RecruitingNode>;
  /** 用户授权的保守推断：普通自由名称归复试，明确终面/终试归终面。 */
  inferLegacyNodes?: boolean;
}
export interface MigrationPlan {
  items: CopyItem[];
  decisions: { sourceTable: string; sourceKey: string; decision: string; reason: string }[];
  warnings: string[];
}

export function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("Missing expected migration value");
  }
  return value;
}
