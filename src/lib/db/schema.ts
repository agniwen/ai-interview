/* oxlint-disable no-inline-comments -- `/* @__PURE__ *\/` is a bundler annotation, not a human comment. */

import type { UIMessage } from "ai";
import type {
  CandidateFormDisplayMode,
  CandidateFormOption,
  CandidateFormQuestionType,
  CandidateFormScope,
  CandidateFormTemplateSnapshot,
} from "@/lib/candidate-forms";
import type {
  InterviewQuestionTemplateDifficulty,
  InterviewQuestionTemplateScope,
  InterviewQuestionTemplateSnapshot,
} from "@/lib/interview-question-templates";
import type { InterviewTranscriptTurn } from "@/lib/interview-session";
import type { InterviewQuestion, ResumeProfile } from "@/lib/interview/types";
import type { JobDescriptionConfig } from "@/lib/job-description-config";
import type { MinimaxVoiceId } from "@/lib/minimax-voices";
import type { ScheduleEntryStatus, StudioInterviewStatus } from "@/lib/studio-interviews";
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// --- Tables managed by @chat-adapter/state-pg ---
// Declared here so drizzle-kit sees them and doesn't try to drop them on `db:push`.
// These tables are created + queried by the chat adapter package itself — the app
// code never reads/writes them directly via drizzle.

export const chatStateSubscriptions = pgTable(
  "chat_state_subscriptions",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    keyPrefix: text("key_prefix").notNull(),
    threadId: text("thread_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.keyPrefix, table.threadId] })],
);

export const chatStateLocks = pgTable(
  "chat_state_locks",
  {
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    keyPrefix: text("key_prefix").notNull(),
    threadId: text("thread_id").notNull(),
    token: text("token").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.keyPrefix, table.threadId] }),
    index("chat_state_locks_expires_idx").on(table.expiresAt),
  ],
);

export const chatStateCache = pgTable(
  "chat_state_cache",
  {
    cacheKey: text("cache_key").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    keyPrefix: text("key_prefix").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    value: text("value").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.keyPrefix, table.cacheKey] }),
    index("chat_state_cache_expires_idx").on(table.expiresAt),
  ],
);

export const chatStateLists = pgTable(
  "chat_state_lists",
  {
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    keyPrefix: text("key_prefix").notNull(),
    listKey: text("list_key").notNull(),
    seq: bigserial("seq", { mode: "bigint" }).notNull(),
    value: text("value").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.keyPrefix, table.listKey, table.seq] }),
    index("chat_state_lists_expires_idx").on(table.expiresAt),
  ],
);

export const chatStateQueues = pgTable(
  "chat_state_queues",
  {
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    keyPrefix: text("key_prefix").notNull(),
    seq: bigserial("seq", { mode: "bigint" }).notNull(),
    threadId: text("thread_id").notNull(),
    value: text("value").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.keyPrefix, table.threadId, table.seq] }),
    index("chat_state_queues_expires_idx").on(table.expiresAt),
  ],
);

export const user = pgTable("user", {
  banExpires: timestamp("ban_expires"),
  banReason: text("ban_reason"),
  banned: boolean("banned").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  id: text("id").primaryKey(),
  image: text("image"),
  name: text("name").notNull(),
  organizationId: text("organization_id"),
  organizationName: text("organization_name"),
  role: text("role").default("user").notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    id: text("id").primaryKey(),
    impersonatedBy: text("impersonated_by"),
    ipAddress: text("ip_address"),
    token: text("token").notNull().unique(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    accessToken: text("access_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    accountId: text("account_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: text("id").primaryKey(),
    idToken: text("id_token"),
    password: text("password"),
    providerId: text("provider_id").notNull(),
    refreshToken: text("refresh_token"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    value: text("value").notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const studioInterview = pgTable(
  "studio_interview",
  {
    candidateEmail: text("candidate_email"),
    candidateName: text("candidate_name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    id: text("id").primaryKey(),
    interviewQuestions: jsonb("interview_questions")
      .$type<InterviewQuestion[]>()
      .notNull()
      .default([]),
    // oxlint-disable-next-line no-use-before-define -- drizzle-orm resolves refs lazily at runtime
    jobDescriptionId: text("job_description_id").references(() => jobDescription.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    resumeFileName: text("resume_file_name"),
    resumeProfile: jsonb("resume_profile").$type<ResumeProfile | null>(),
    resumeStorageKey: text("resume_storage_key"),
    status: text("status").$type<StudioInterviewStatus>().notNull(),
    targetRole: text("target_role"),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("studio_interview_status_idx").on(table.status),
    index("studio_interview_created_at_idx").on(table.createdAt),
    index("studio_interview_created_by_idx").on(table.createdBy),
    index("studio_interview_job_description_idx").on(table.jobDescriptionId),
  ],
);

export const department = pgTable(
  "department",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    description: text("description"),
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("department_name_idx").on(table.name),
    index("department_created_at_idx").on(table.createdAt),
  ],
);

export const interviewer = pgTable(
  "interviewer",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    departmentId: text("department_id")
      .notNull()
      .references(() => department.id, { onDelete: "restrict" }),
    description: text("description"),
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    prompt: text("prompt").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    voice: text("voice").$type<MinimaxVoiceId>().notNull(),
  },
  (table) => [
    index("interviewer_department_idx").on(table.departmentId),
    index("interviewer_name_idx").on(table.name),
    index("interviewer_created_at_idx").on(table.createdAt),
  ],
);

export const jobDescription = pgTable(
  "job_description",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    departmentId: text("department_id")
      .notNull()
      .references(() => department.id, { onDelete: "restrict" }),
    description: text("description"),
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    presetQuestions: jsonb("preset_questions").$type<string[]>().notNull().default([]),
    prompt: text("prompt").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("job_description_department_idx").on(table.departmentId),
    index("job_description_name_idx").on(table.name),
    index("job_description_created_at_idx").on(table.createdAt),
  ],
);

export const jobDescriptionInterviewer = pgTable(
  "job_description_interviewer",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    interviewerId: text("interviewer_id")
      .notNull()
      .references(() => interviewer.id, { onDelete: "restrict" }),
    jobDescriptionId: text("job_description_id")
      .notNull()
      .references(() => jobDescription.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.jobDescriptionId, table.interviewerId] }),
    index("job_description_interviewer_interviewer_idx").on(table.interviewerId),
  ],
);

export const studioInterviewSchedule = pgTable(
  "studio_interview_schedule",
  {
    conversationId: text("conversation_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: text("id").primaryKey(),
    interviewRecordId: text("interview_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    notes: text("notes"),
    roundLabel: text("round_label").notNull(),
    scheduledAt: timestamp("scheduled_at"),
    sortOrder: integer("sort_order").notNull(),
    status: text("status").$type<ScheduleEntryStatus>().notNull().default("pending"),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("studio_interview_schedule_record_idx").on(table.interviewRecordId),
    index("studio_interview_schedule_sort_idx").on(table.interviewRecordId, table.sortOrder),
  ],
);

export const interviewConversation = pgTable(
  "interview_conversation",
  {
    agentId: text("agent_id"),
    callSuccessful: text("call_successful"),
    conversationId: text("conversation_id").primaryKey(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    dataCollectionResults: jsonb("data_collection_results")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    dynamicVariables: jsonb("dynamic_variables")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    endedAt: timestamp("ended_at"),
    evaluationCriteriaResults: jsonb("evaluation_criteria_results")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    interviewRecordId: text("interview_record_id").references(() => studioInterview.id, {
      onDelete: "set null",
    }),
    lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
    latestError: text("latest_error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    mode: text("mode"),
    scheduleEntryId: text("schedule_entry_id").references(() => studioInterviewSchedule.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at"),
    status: text("status").notNull().default("initiated"),
    summaryAttempts: integer("summary_attempts").notNull().default(0),
    summaryError: text("summary_error"),
    summaryStartedAt: timestamp("summary_started_at"),
    summaryStatus: text("summary_status")
      .$type<"pending" | "running" | "ready" | "failed">()
      .notNull()
      .default("pending"),
    transcript: jsonb("transcript").$type<InterviewTranscriptTurn[]>().notNull().default([]),
    transcriptSummary: text("transcript_summary"),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    webhookReceivedAt: timestamp("webhook_received_at"),
  },
  (table) => [
    index("interview_conversation_record_idx").on(table.interviewRecordId),
    index("interview_conversation_status_idx").on(table.status),
    index("interview_conversation_summary_status_idx").on(table.summaryStatus),
    index("interview_conversation_updated_at_idx").on(table.updatedAt),
  ],
);

export const interviewConversationTurn = pgTable(
  "interview_conversation_turn",
  {
    conversationId: text("conversation_id")
      .notNull()
      .references(() => interviewConversation.conversationId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull(),
    id: text("id").primaryKey(),
    interviewRecordId: text("interview_record_id").references(() => studioInterview.id, {
      onDelete: "set null",
    }),
    message: text("message").notNull(),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
    role: text("role").$type<"agent" | "user">().notNull(),
    source: text("source").notNull().default("client_event"),
    timeInCallSecs: integer("time_in_call_secs"),
  },
  (table) => [
    index("interview_conversation_turn_conversation_idx").on(table.conversationId, table.createdAt),
    index("interview_conversation_turn_record_idx").on(table.interviewRecordId, table.createdAt),
  ],
);

export const chatConversation = pgTable(
  "chat_conversation",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: text("id").primaryKey(),
    isTitleGenerating: boolean("is_title_generating").default(false).notNull(),
    jobDescription: text("job_description").default("").notNull(),
    jobDescriptionConfig: jsonb("job_description_config").$type<JobDescriptionConfig>(),
    resumeImports: jsonb("resume_imports").$type<Record<string, string>>().default({}).notNull(),
    title: text("title").default("").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("chat_conversation_user_id_idx").on(table.userId),
    index("chat_conversation_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const chatMessage = pgTable(
  "chat_message",
  {
    content: jsonb("content").$type<UIMessage>().notNull(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => chatConversation.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: text("id").primaryKey(),
    role: text("role").$type<UIMessage["role"]>().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("chat_message_conversation_idx").on(table.conversationId, table.createdAt)],
);

export const chatAttachment = pgTable(
  "chat_attachment",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    filename: text("filename").notNull(),
    id: text("id").primaryKey(),
    mediaType: text("media_type").notNull(),
    size: integer("size").notNull(),
    storageKey: text("storage_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("chat_attachment_user_id_idx").on(table.userId)],
);

export const interviewAuditLog = pgTable(
  "interview_audit_log",
  {
    action: text("action").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    id: text("id").primaryKey(),
    interviewRecordId: text("interview_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    operatorId: text("operator_id").references(() => user.id, { onDelete: "set null" }),
    scheduleEntryId: text("schedule_entry_id").references(() => studioInterviewSchedule.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("interview_audit_log_record_idx").on(table.interviewRecordId),
    index("interview_audit_log_created_at_idx").on(table.createdAt),
  ],
);

export const candidateFormTemplate = pgTable(
  "candidate_form_template",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    description: text("description"),
    id: text("id").primaryKey(),
    jobDescriptionId: text("job_description_id").references(() => jobDescription.id, {
      onDelete: "cascade",
    }),
    scope: text("scope").$type<CandidateFormScope>().notNull(),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("candidate_form_template_scope_idx").on(table.scope),
    index("candidate_form_template_job_description_idx").on(table.jobDescriptionId),
    index("candidate_form_template_created_at_idx").on(table.createdAt),
  ],
);

export const candidateFormTemplateQuestion = pgTable(
  "candidate_form_template_question",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    displayMode: text("display_mode").$type<CandidateFormDisplayMode>().notNull(),
    helperText: text("helper_text"),
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    options: jsonb("options").$type<CandidateFormOption[]>().notNull().default([]),
    required: boolean("required").default(false).notNull(),
    sortOrder: integer("sort_order").notNull(),
    templateId: text("template_id")
      .notNull()
      .references(() => candidateFormTemplate.id, { onDelete: "cascade" }),
    type: text("type").$type<CandidateFormQuestionType>().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("candidate_form_template_question_template_idx").on(table.templateId),
    index("candidate_form_template_question_order_idx").on(table.templateId, table.sortOrder),
  ],
);

export const candidateFormTemplateVersion = pgTable(
  "candidate_form_template_version",
  {
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: text("id").primaryKey(),
    snapshot: jsonb("snapshot").$type<CandidateFormTemplateSnapshot>().notNull(),
    templateId: text("template_id")
      .notNull()
      .references(() => candidateFormTemplate.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
  },
  (table) => [
    uniqueIndex("candidate_form_template_version_template_version_uq").on(
      table.templateId,
      table.version,
    ),
    uniqueIndex("candidate_form_template_version_template_hash_uq").on(
      table.templateId,
      table.contentHash,
    ),
  ],
);

export const candidateFormSubmission = pgTable(
  "candidate_form_submission",
  {
    answers: jsonb("answers").$type<Record<string, string | string[]>>().notNull().default({}),
    id: text("id").primaryKey(),
    interviewRecordId: text("interview_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    submittedAt: timestamp("submitted_at").defaultNow().notNull(),
    templateId: text("template_id")
      .notNull()
      .references(() => candidateFormTemplate.id, { onDelete: "restrict" }),
    versionId: text("version_id")
      .notNull()
      .references(() => candidateFormTemplateVersion.id, { onDelete: "restrict" }),
  },
  (table) => [
    uniqueIndex("candidate_form_submission_template_interview_uq").on(
      table.templateId,
      table.interviewRecordId,
    ),
    index("candidate_form_submission_version_idx").on(table.versionId),
    index("candidate_form_submission_interview_idx").on(table.interviewRecordId),
  ],
);

// =====================================================================
// Interview question templates — agent's mandatory questions to ask
// during the interview. Mirrors candidate_form_template structure but
// stores plain question text (no types/options/required). Replaces the
// legacy `jobDescription.presetQuestions` column.
// =====================================================================

export const interviewQuestionTemplate = pgTable(
  "interview_question_template",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    description: text("description"),
    id: text("id").primaryKey(),
    jobDescriptionId: text("job_description_id").references(() => jobDescription.id, {
      onDelete: "cascade",
    }),
    scope: text("scope").$type<InterviewQuestionTemplateScope>().notNull(),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("interview_question_template_scope_idx").on(table.scope),
    index("interview_question_template_job_description_idx").on(table.jobDescriptionId),
    index("interview_question_template_created_at_idx").on(table.createdAt),
  ],
);

export const interviewQuestionTemplateQuestion = pgTable(
  "interview_question_template_question",
  {
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    difficulty: text("difficulty")
      .$type<InterviewQuestionTemplateDifficulty>()
      .notNull()
      .default("easy"),
    id: text("id").primaryKey(),
    sortOrder: integer("sort_order").notNull(),
    templateId: text("template_id")
      .notNull()
      .references(() => interviewQuestionTemplate.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("interview_question_template_question_template_idx").on(table.templateId),
    index("interview_question_template_question_order_idx").on(table.templateId, table.sortOrder),
  ],
);

export const interviewQuestionTemplateVersion = pgTable(
  "interview_question_template_version",
  {
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: text("id").primaryKey(),
    snapshot: jsonb("snapshot").$type<InterviewQuestionTemplateSnapshot>().notNull(),
    templateId: text("template_id")
      .notNull()
      .references(() => interviewQuestionTemplate.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
  },
  (table) => [
    uniqueIndex("interview_question_template_version_template_version_uq").on(
      table.templateId,
      table.version,
    ),
    uniqueIndex("interview_question_template_version_template_hash_uq").on(
      table.templateId,
      table.contentHash,
    ),
  ],
);

// Binding between an interview record and a frozen template version.
// disabledByUser lets the operator opt out of a template on the interview
// detail page without deleting the row — this preserves the manual override
// across JD changes and across template content updates.
export const interviewQuestionTemplateBinding = pgTable(
  "interview_question_template_binding",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    disabledByUser: boolean("disabled_by_user").default(false).notNull(),
    id: text("id").primaryKey(),
    interviewRecordId: text("interview_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull(),
    templateId: text("template_id")
      .notNull()
      .references(() => interviewQuestionTemplate.id, { onDelete: "restrict" }),
    versionId: text("version_id")
      .notNull()
      .references(() => interviewQuestionTemplateVersion.id, { onDelete: "restrict" }),
  },
  (table) => [
    uniqueIndex("interview_question_template_binding_interview_template_uq").on(
      table.interviewRecordId,
      table.templateId,
    ),
    index("interview_question_template_binding_interview_idx").on(table.interviewRecordId),
    index("interview_question_template_binding_template_idx").on(table.templateId),
    index("interview_question_template_binding_version_idx").on(table.versionId),
  ],
);
