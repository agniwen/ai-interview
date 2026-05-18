/* oxlint-disable no-inline-comments -- `/* @__PURE__ *\/` is a bundler annotation, not a human comment. */

import type { UIMessage } from "ai";
import type {
  CandidateFormDisplayMode,
  CandidateFormOption,
  CandidateFormQuestionType,
  CandidateFormScope,
  CandidateFormTemplateSnapshot,
} from "@/lib/shared/candidate-forms";
import type {
  AgentNotificationStatus,
  AgentNotificationType,
  AttachmentParseStatus,
  AttachmentTextSource,
  InterviewMessageRole,
  InterviewRecordingStatus,
  InterviewSummaryStatus,
} from "@/lib/shared/db-enums";
import type {
  InterviewQuestionTemplateDifficulty,
  InterviewQuestionTemplateScope,
  InterviewQuestionTemplateSnapshot,
} from "@/lib/shared/interview-question-templates";
import type { InterviewTranscriptTurn } from "@/lib/shared/interview-session";
import type { InterviewQuestion, ResumeProfile } from "@/lib/shared/interview/types";
import type { JobDescriptionConfig } from "@/lib/shared/job-description-config";
import type { MinimaxVoiceId } from "@/lib/shared/minimax-voices";
import type { ScheduleEntryStatus, StudioInterviewStatus } from "@/lib/shared/studio-interviews";
import type { ResumeParserStructured } from "@/lib/shared/resume-parser-schema";
import { sql } from "drizzle-orm";
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
  feishuTenantKey: text("feishu_tenant_key"),
  feishuTenantName: text("feishu_tenant_name"),
  id: text("id").primaryKey(),
  image: text("image"),
  // 跨 session 持久化的"最近访问的工作区"。session.activeOrganizationId
  // 跟着 session 走，退出登录 session 会被销毁；这里挂在 user 行上，下次
  // 登录能恢复到上次离开时所在的 org。删除 org 时 SET NULL（用户保留，
  // 下次登录回退到默认 fallback 即可）。
  // Cross-session "last visited workspace" for restore-on-login. Sits on
  // user (vs session.activeOrganizationId which dies with the session). On
  // org deletion the FK SETs NULL so the user row survives.
  // 跨 session 持久化的"最近活跃时间"。每次新建 session（登录）写一次；
  // 在 session 行被删（登出 / 过期清理）后仍然作为兜底显示，避免成员列表里
  // 出现"昨天还在用却显示从未登录"的错觉。
  // Persistent last-active timestamp. Written on every new session (sign-in).
  // Survives session-row deletion so the members list doesn't regress to
  // "从未登录" for previously-seen users.
  lastActiveAt: timestamp("last_active_at"),
  lastActiveOrganizationId: text("last_active_organization_id"),
  name: text("name").notNull(),
  role: text("role").default("user").notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    activeOrganizationId: text("active_organization_id"),
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
  (table) => [
    index("account_userId_idx").on(table.userId),
    uniqueIndex("account_provider_account_uq").on(table.providerId, table.accountId),
  ],
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

export const organization = pgTable("organization", {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  id: text("id").primaryKey(),
  logo: text("logo"),
  metadata: text("metadata"),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
});

export const member = pgTable(
  "member",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("member_user_org_uq").on(table.userId, table.organizationId),
    index("member_organization_idx").on(table.organizationId),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    id: text("id").primaryKey(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    role: text("role"),
    status: text("status").notNull().default("pending"),
  },
  (table) => [
    index("invitation_organization_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ],
);

export const studioInterview = pgTable(
  "studio_interview",
  {
    candidateEmail: text("candidate_email"),
    candidateName: text("candidate_name").notNull(),
    candidatePhone: text("candidate_phone"),
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
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
    resumeContentHash: text("resume_content_hash"),
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
    index("studio_interview_organization_idx").on(table.organizationId),
    index("studio_interview_resume_content_hash_idx").on(table.resumeContentHash),
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
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("department_name_idx").on(table.name),
    index("department_created_at_idx").on(table.createdAt),
    index("department_organization_idx").on(table.organizationId),
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
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
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
    index("interviewer_organization_idx").on(table.organizationId),
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
    feishuChatBoundAt: timestamp("feishu_chat_bound_at"),
    feishuChatBoundBy: text("feishu_chat_bound_by").references(() => user.id, {
      onDelete: "set null",
    }),
    feishuChatId: text("feishu_chat_id"),
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
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
    index("job_description_organization_idx").on(table.organizationId),
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
    allowTextInput: boolean("allow_text_input").notNull().default(false),
    conversationId: text("conversation_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // 热重连锚点：轮次首次开始时持久化 LiveKit 房间名、参与者 identity、
    // 会话起始时间。断连超过 LiveKit 自动重连窗口时记录 disconnectedAt，
    // 给候选人 3 分钟内回到同一房间继续对话。
    // Hot-reconnect anchor columns: persist the LiveKit room/identity and
    // session start so a candidate can rejoin the same room within 3 minutes
    // after a hard disconnect.
    disconnectedAt: timestamp("disconnected_at"),
    id: text("id").primaryKey(),
    interviewRecordId: text("interview_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    liveKitParticipantIdentity: text("livekit_participant_identity"),
    liveKitRoomName: text("livekit_room_name"),
    notes: text("notes"),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
    roundLabel: text("round_label").notNull(),
    scheduledAt: timestamp("scheduled_at"),
    sessionStartedAt: timestamp("session_started_at"),
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
    index("studio_interview_schedule_organization_idx").on(table.organizationId),
  ],
);

export type ResumeUploadBatchStatus = "pending" | "running" | "completed" | "cancelled";
export type ResumeUploadBatchJdMode = "bind" | "auto" | "none";
export type ResumeUploadBatchDedupPolicy = "skip" | "create";
export type ResumeUploadBatchItemStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "duplicate_skipped"
  | "cancelled";

export const resumeUploadBatch = pgTable(
  "resume_upload_batch",
  {
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    dedupPolicy: text("dedup_policy").$type<ResumeUploadBatchDedupPolicy>().notNull(),
    failedCount: integer("failed_count").notNull().default(0),
    id: text("id").primaryKey(),
    jdMode: text("jd_mode").$type<ResumeUploadBatchJdMode>().notNull(),
    // oxlint-disable-next-line no-use-before-define
    jobDescriptionId: text("job_description_id").references(() => jobDescription.id, {
      onDelete: "set null",
    }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    processedCount: integer("processed_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    status: text("status").$type<ResumeUploadBatchStatus>().notNull(),
    succeededCount: integer("succeeded_count").notNull().default(0),
    totalCount: integer("total_count").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("resume_upload_batch_org_user_status_idx").on(
      table.organizationId,
      table.createdBy,
      table.status,
    ),
    index("resume_upload_batch_org_user_created_idx").on(
      table.organizationId,
      table.createdBy,
      table.createdAt,
    ),
    // 单用户单租户活跃批次唯一约束（partial unique index）。
    // Active-batch uniqueness per (org, user); only one pending/running allowed.
    uniqueIndex("resume_upload_batch_active_unique_idx")
      .on(table.organizationId, table.createdBy)
      .where(sql`${table.status} in ('pending','running')`),
  ],
);

export const resumeUploadBatchItem = pgTable(
  "resume_upload_batch_item",
  {
    batchId: text("batch_id")
      .notNull()
      .references(() => resumeUploadBatch.id, { onDelete: "cascade" }),
    dedupMatchSnapshot: jsonb("dedup_match_snapshot"),
    errorMessage: text("error_message"),
    fileSize: integer("file_size").notNull(),
    finishedAt: timestamp("finished_at"),
    id: text("id").primaryKey(),
    orderIndex: integer("order_index").notNull(),
    organizationId: text("organization_id").notNull(),
    originalFileName: text("original_file_name").notNull(),
    resumeRecordId: text("resume_record_id").references(() => studioInterview.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at"),
    status: text("status").$type<ResumeUploadBatchItemStatus>().notNull(),
    storageKey: text("storage_key").notNull(),
  },
  (table) => [
    index("resume_upload_batch_item_batch_order_idx").on(table.batchId, table.orderIndex),
    index("resume_upload_batch_item_batch_status_idx").on(table.batchId, table.status),
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
    metrics: jsonb("metrics").$type<Record<string, unknown>>().notNull().default({}),
    mode: text("mode"),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
    // 录像相关：通过 LiveKit RoomCompositeEgress 直传 S3 后写回
    // Recording fields populated after LiveKit RoomCompositeEgress finishes uploading to S3
    recordingDurationSecs: integer("recording_duration_secs"),
    recordingEgressId: text("recording_egress_id"),
    recordingFileKey: text("recording_file_key"),
    recordingStatus: text("recording_status").$type<InterviewRecordingStatus>(),
    scheduleEntryId: text("schedule_entry_id").references(() => studioInterviewSchedule.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at"),
    status: text("status").notNull().default("initiated"),
    summaryAttempts: integer("summary_attempts").notNull().default(0),
    summaryError: text("summary_error"),
    summaryStartedAt: timestamp("summary_started_at"),
    summaryStatus: text("summary_status")
      .$type<InterviewSummaryStatus>()
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
    index("interview_conversation_organization_idx").on(table.organizationId),
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
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
    role: text("role").$type<InterviewMessageRole>().notNull(),
    source: text("source").notNull().default("client_event"),
    timeInCallSecs: integer("time_in_call_secs"),
  },
  (table) => [
    index("interview_conversation_turn_conversation_idx").on(table.conversationId, table.createdAt),
    index("interview_conversation_turn_record_idx").on(table.interviewRecordId, table.createdAt),
    index("interview_conversation_turn_organization_idx").on(table.organizationId),
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
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
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
    index("chat_conversation_organization_idx").on(table.organizationId),
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
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
    role: text("role").$type<UIMessage["role"]>().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("chat_message_conversation_idx").on(table.conversationId, table.createdAt),
    index("chat_message_organization_idx").on(table.organizationId),
  ],
);

export const chatAttachment = pgTable(
  "chat_attachment",
  {
    contentHash: text("content_hash"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    filename: text("filename").notNull(),
    id: text("id").primaryKey(),
    mediaType: text("media_type").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
    parsedAt: timestamp("parsed_at"),
    parsedError: text("parsed_error"),
    parsedPageCount: integer("parsed_page_count"),
    parsedStatus: text("parsed_status").$type<AttachmentParseStatus>().default("pending").notNull(),
    parsedStructured: jsonb("parsed_structured").$type<ResumeParserStructured>(),
    parsedText: text("parsed_text"),
    parsedTextSource: text("parsed_text_source").$type<AttachmentTextSource>(),
    size: integer("size").notNull(),
    storageKey: text("storage_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("chat_attachment_user_id_idx").on(table.userId),
    index("chat_attachment_content_hash_idx").on(table.contentHash),
    index("chat_attachment_organization_idx").on(table.organizationId),
  ],
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
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
    scheduleEntryId: text("schedule_entry_id").references(() => studioInterviewSchedule.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("interview_audit_log_record_idx").on(table.interviewRecordId),
    index("interview_audit_log_created_at_idx").on(table.createdAt),
    index("interview_audit_log_organization_idx").on(table.organizationId),
  ],
);

export const interviewNotification = pgTable(
  "interview_notification",
  {
    conversationId: text("conversation_id").references(() => interviewConversation.conversationId, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    error: text("error"),
    feishuMessageId: text("feishu_message_id"),
    id: text("id").primaryKey(),
    interviewRecordId: text("interview_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
    providerId: text("provider_id").notNull(),
    recipientOpenId: text("recipient_open_id").notNull(),
    recipientUserId: text("recipient_user_id").references(() => user.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at"),
    status: text("status").$type<AgentNotificationStatus>().notNull().default("pending"),
    type: text("type").$type<AgentNotificationType>().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("interview_notification_record_idx").on(table.interviewRecordId),
    index("interview_notification_recipient_idx").on(table.recipientUserId),
    uniqueIndex("interview_notification_once_uq").on(
      table.interviewRecordId,
      table.conversationId,
      table.type,
      table.recipientUserId,
      table.providerId,
    ),
    index("interview_notification_organization_idx").on(table.organizationId),
  ],
);

export const candidateFormTemplate = pgTable(
  "candidate_form_template",
  {
    // 归档时间戳，软删除标记。NULL = 未归档，有值 = 已归档于该时间。
    // Archive timestamp acting as a soft-delete marker. NULL = active.
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    description: text("description"),
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
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
    index("candidate_form_template_created_at_idx").on(table.createdAt),
    index("candidate_form_template_organization_idx").on(table.organizationId),
    index("candidate_form_template_org_archived_idx").on(table.organizationId, table.archivedAt),
  ],
);

// 表单模板 ↔ 在招岗位 多对多关联表
// Many-to-many link between candidate form templates and job descriptions.
// 仅当 template.scope = "job_description" 时存在记录；scope 切回 "global" 时
// 应一并清空。删除 JD 或 template 时通过外键级联清理。
export const candidateFormTemplateJobDescription = pgTable(
  "candidate_form_template_job_description",
  {
    jobDescriptionId: text("job_description_id")
      .notNull()
      .references(() => jobDescription.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => candidateFormTemplate.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.templateId, table.jobDescriptionId] }),
    index("candidate_form_template_jd_jd_idx").on(table.jobDescriptionId),
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
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
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
    index("candidate_form_submission_organization_idx").on(table.organizationId),
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
    // 归档时间戳，软删除标记。NULL = 未归档，有值 = 已归档于该时间。
    // Archive timestamp acting as a soft-delete marker. NULL = active.
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    description: text("description"),
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
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
    index("interview_question_template_created_at_idx").on(table.createdAt),
    index("interview_question_template_organization_idx").on(table.organizationId),
    index("interview_question_template_org_archived_idx").on(
      table.organizationId,
      table.archivedAt,
    ),
  ],
);

// 面试题模板 ↔ 在招岗位 多对多关联表
// Many-to-many link between interview question templates and job descriptions.
export const interviewQuestionTemplateJobDescription = pgTable(
  "interview_question_template_job_description",
  {
    jobDescriptionId: text("job_description_id")
      .notNull()
      .references(() => jobDescription.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => interviewQuestionTemplate.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.templateId, table.jobDescriptionId] }),
    index("interview_question_template_jd_jd_idx").on(table.jobDescriptionId),
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
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
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
    index("interview_question_template_binding_organization_idx").on(table.organizationId),
  ],
);

// =====================================================================
// Feishu bot per-thread state (DM thread or group chat). Currently stores
// the user's "active JD" selection; future per-thread scratch state should
// be added here as new columns rather than spawning new tables.
// 中文：飞书 bot 按 thread 维度的会话状态，目前用于记录 HR 在 DM 中激活的 JD。
// =====================================================================

export const feishuThreadState = pgTable(
  "feishu_thread_state",
  {
    activeJdId: text("active_jd_id").references(() => jobDescription.id, {
      onDelete: "set null",
    }),
    activeJdSetAt: timestamp("active_jd_set_at"),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
    threadId: text("thread_id").primaryKey(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("feishu_thread_state_organization_idx").on(table.organizationId)],
);

// 系统设置（单例表，固定 id="singleton"）
// Global config (singleton table, id="singleton")
export const globalConfig = pgTable("global_config", {
  closingInstructions: text("closing_instructions").notNull().default(""),
  companyContext: text("company_context").notNull().default(""),
  id: text("id").primaryKey().default("singleton"),
  openingInstructions: text("opening_instructions").notNull().default(""),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, {
      onDelete: "cascade",
    }),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});
