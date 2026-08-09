/* oxlint-disable no-inline-comments -- `/* @__PURE__ *\/` is a bundler annotation, not a human comment. */

import type { ArcMessage, ArcMessageRole } from "./ai-message";
import type {
  CandidateFormDisplayMode,
  CandidateFormOption,
  CandidateFormQuestionType,
  CandidateFormScope,
  CandidateFormTemplateSnapshot,
} from "./candidate-forms";
import type {
  AgentNotificationStatus,
  AgentNotificationType,
  AttachmentParseStatus,
  AttachmentTextSource,
  InterviewMessageRole,
  InterviewRecordingStatus,
  InterviewSummaryStatus,
} from "./db-enums";
import type {
  InterviewQuestionTemplateDifficulty,
  InterviewQuestionTemplateScope,
  InterviewQuestionTemplateSnapshot,
} from "./interview-question-templates";
import type {
  InterviewContextSnapshotPayload,
  InterviewContextSnapshotReason,
  InterviewEvidenceSnapshotPayload,
  InterviewSnapshotStatus,
} from "./interview-snapshots";
import type { InterviewKeyInformation } from "./interview-key-information";
import type { InterviewTranscriptTurn } from "./interview-session";
import type { InterviewQuestion, ResumeProfile } from "./interview/types";
import type { JobDescriptionConfig } from "./job-description-config";
import type {
  JobEvaluationBlueprint,
  JobEvaluationMode,
  JobLifecycleStatus,
} from "./job-description-evaluation";
import type { JobDescriptionStructuredConfig } from "./job-description-structured-config";
import { createDefaultJobDescriptionStructuredConfig } from "./job-description-structured-config";
import type { MinimaxVoiceId } from "./minimax-voices";
import type {
  CandidateExpectationsMeta,
  CandidateInterviewFeedbackCategory,
  CandidateOutcome,
  ClosedMeta,
  FeishuHumanInterviewProviderId,
  FeishuHumanInterviewSyncStatus,
  HumanInterviewFormat,
  HumanInterviewMeetingInterviewerRole,
  HumanInterviewMeetingStatus,
  HumanInterviewRoundOutcome,
  HumanInterviewRoundStatus,
  OfferDraftStatus,
  PipelineStage,
  ResumeEvaluationStatus,
  ResumeParseStatus,
  ResumeReviewStatus,
  ResumeScreeningStatus,
  ScheduleEntryStatus,
} from "./studio-interviews";
import type { ResumeParserStructured } from "./resume-parser-schema";
import type { ResumeReview } from "./resume-review";
import type {
  StructuredResumeEvaluationV1,
  StructuredResumeGateStatus,
  StructuredResumeGrade,
} from "./structured-resume-evaluation";
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

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
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  banReason: text("ban_reason"),
  banned: boolean("banned").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  lastActiveOrganizationId: text("last_active_organization_id"),
  name: text("name").notNull(),
  remark: text("remark"),
  role: text("role").default("user").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    activeOrganizationId: text("active_organization_id"),
    authProviderId: text("auth_provider_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    id: text("id").primaryKey(),
    impersonatedBy: text("impersonated_by"),
    ipAddress: text("ip_address"),
    token: text("token").notNull().unique(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
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
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    accountId: text("account_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    id: text("id").primaryKey(),
    idToken: text("id_token"),
    password: text("password"),
    providerId: text("provider_id").notNull(),
    refreshToken: text("refresh_token"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    value: text("value").notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const organization = pgTable("organization", {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  id: text("id").primaryKey(),
  logo: text("logo"),
  metadata: text("metadata"),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
});

export const member = pgTable(
  "member",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    id: text("id").primaryKey(),
    // oxlint-disable-next-line no-use-before-define -- drizzle-orm resolves refs lazily at runtime
    inviteLinkId: text("invite_link_id").references(() => workspaceInviteLink.id, {
      onDelete: "set null",
    }),
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

export const meetingSession = pgTable(
  "meeting_session",
  {
    activeIntelligenceRevisionId: text("active_intelligence_revision_id").references(
      // oxlint-disable-next-line no-use-before-define -- Drizzle resolves this circular FK lazily.
      (): AnyPgColumn => meetingIntelligenceRevision.id,
      { onDelete: "set null" },
    ),
    activeTranscriptRevisionId: text("active_transcript_revision_id").references(
      // oxlint-disable-next-line no-use-before-define -- Drizzle resolves this circular FK lazily.
      (): AnyPgColumn => meetingTranscriptRevision.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    custodianId: text("custodian_id").references(() => user.id, { onDelete: "set null" }),
    id: text("id").primaryKey(),
    intelligenceError: text("intelligence_error"),
    intelligenceRunId: text("intelligence_run_id").references(
      // oxlint-disable-next-line no-use-before-define -- Drizzle resolves this circular FK lazily.
      (): AnyPgColumn => meetingProcessingRun.id,
      { onDelete: "set null" },
    ),
    intelligenceStatus: text("intelligence_status").default("pending").notNull(),
    manifestSha256: text("manifest_sha256").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    processingError: text("processing_error"),
    processingRunId: text("processing_run_id"),
    recoveryCopyDeleteAfter: timestamp("recovery_copy_delete_after", { withTimezone: true }),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    status: text("status").default("uploading").notNull(),
    title: text("title").notNull(),
    transcriptionError: text("transcription_error"),
    transcriptionRunId: text("transcription_run_id").references(
      // oxlint-disable-next-line no-use-before-define -- Drizzle resolves this circular FK lazily.
      (): AnyPgColumn => meetingProcessingRun.id,
      { onDelete: "set null" },
    ),
    transcriptionStatus: text("transcription_status").default("pending").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    visibility: text("visibility").default("restricted").notNull(),
  },
  (table) => [
    check(
      "meeting_session_visibility_check",
      sql`${table.visibility} in ('restricted', 'workspace')`,
    ),
    check(
      "meeting_session_intelligence_status_check",
      sql`${table.intelligenceStatus} in ('pending', 'processing', 'ready', 'failed')`,
    ),
    check(
      "meeting_session_transcription_status_check",
      sql`${table.transcriptionStatus} in ('pending', 'processing', 'ready', 'failed')`,
    ),
    index("meeting_session_org_owner_saved_idx").on(
      table.organizationId,
      table.ownerId,
      table.savedAt,
    ),
    index("meeting_session_org_status_saved_idx").on(
      table.organizationId,
      table.status,
      table.savedAt,
    ),
    uniqueIndex("meeting_session_id_org_uq").on(table.id, table.organizationId),
  ],
);

export const meetingRecruitingContext = pgTable(
  "meeting_recruiting_context",
  {
    linkedAt: timestamp("linked_at", { withTimezone: true }).defaultNow().notNull(),
    linkedBy: text("linked_by").references(() => user.id, { onDelete: "set null" }),
    meetingId: text("meeting_id")
      .primaryKey()
      .references(() => meetingSession.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    recruitingRecordId: text("recruiting_record_id")
      .notNull()
      .references(
        // oxlint-disable-next-line no-use-before-define -- Drizzle resolves refs lazily.
        (): AnyPgColumn => studioInterview.id,
        { onDelete: "cascade" },
      ),
  },
  (table) => [
    foreignKey({
      columns: [table.meetingId, table.organizationId],
      foreignColumns: [meetingSession.id, meetingSession.organizationId],
      name: "meeting_recruiting_context_meeting_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [
        // oxlint-disable-next-line no-use-before-define -- Drizzle resolves table extras lazily.
        studioInterview.id,
        // oxlint-disable-next-line no-use-before-define -- Drizzle resolves table extras lazily.
        studioInterview.organizationId,
      ],
      name: "meeting_recruiting_context_record_org_fk",
    }).onDelete("cascade"),
    index("meeting_recruiting_context_org_record_idx").on(
      table.organizationId,
      table.recruitingRecordId,
    ),
  ],
);

export const meetingTranscriptionPolicy = pgTable(
  "meeting_transcription_policy",
  {
    allowedProviders: jsonb("allowed_providers").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull().default(1),
    selectedProvider: text("selected_provider"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    check("meeting_transcription_policy_revision_check", sql`${table.revision} > 0`),
    check(
      "meeting_transcription_policy_selected_check",
      sql`${table.selectedProvider} is null or ${table.allowedProviders} ? ${table.selectedProvider}`,
    ),
  ],
);

export const meetingProcessingRun = pgTable(
  "meeting_processing_run",
  {
    attempt: integer("attempt").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    executionToken: text("execution_token"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    inputTranscriptRevisionId: text("input_transcript_revision_id").references(
      // oxlint-disable-next-line no-use-before-define -- Drizzle resolves this circular FK lazily.
      (): AnyPgColumn => meetingTranscriptRevision.id,
      { onDelete: "restrict" },
    ),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetingSession.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    pipelineVersion: text("pipeline_version").notNull(),
    promptVersion: text("prompt_version"),
    provider: text("provider").notNull(),
    region: text("region").notNull(),
    requestKind: text("request_kind"),
    requestedBy: text("requested_by").references(() => user.id, { onDelete: "set null" }),
    result: jsonb("result"),
    stage: text("stage").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    status: text("status").notNull(),
    templateKey: text("template_key"),
  },
  (table) => [
    check("meeting_processing_run_attempt_check", sql`${table.attempt} >= 0`),
    check(
      "meeting_processing_run_intelligence_input_check",
      sql`(${table.stage} = 'meeting-intelligence' and ${table.inputTranscriptRevisionId} is not null and ${table.templateKey} is not null and ${table.promptVersion} is not null and ${table.requestKind} in ('automatic', 'manual'))
        or (${table.stage} = 'final-transcription' and ${table.inputTranscriptRevisionId} is null and ${table.templateKey} is null and ${table.promptVersion} is null and ${table.requestKind} is null)`,
    ),
    check(
      "meeting_processing_run_stage_check",
      sql`${table.stage} in ('final-transcription', 'meeting-intelligence')`,
    ),
    check(
      "meeting_processing_run_status_check",
      sql`${table.status} in ('pending', 'processing', 'succeeded', 'failed')`,
    ),
    index("meeting_processing_run_meeting_stage_idx").on(
      table.meetingId,
      table.stage,
      table.startedAt,
    ),
    index("meeting_processing_run_org_status_idx").on(
      table.organizationId,
      table.status,
      table.startedAt,
    ),
    uniqueIndex("meeting_processing_run_id_meeting_org_uq").on(
      table.id,
      table.meetingId,
      table.organizationId,
    ),
  ],
);

export const meetingTranscriptRevision = pgTable(
  "meeting_transcript_revision",
  {
    basedOnRevisionId: text("based_on_revision_id").references(
      // oxlint-disable-next-line no-use-before-define -- Drizzle resolves this self-reference lazily.
      (): AnyPgColumn => meetingTranscriptRevision.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    language: text("language"),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetingSession.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    pipelineVersion: text("pipeline_version").notNull(),
    processingRunId: text("processing_run_id").references(() => meetingProcessingRun.id, {
      onDelete: "restrict",
    }),
    provider: text("provider").notNull(),
    region: text("region").notNull(),
    revision: integer("revision").notNull(),
    sourceManifestSha256: text("source_manifest_sha256").notNull(),
  },
  (table) => [
    check("meeting_transcript_revision_kind_check", sql`${table.kind} in ('final', 'human')`),
    check(
      "meeting_transcript_revision_source_check",
      sql`(${table.kind} = 'final' and ${table.basedOnRevisionId} is null and ${table.processingRunId} is not null)
        or (${table.kind} = 'human' and ${table.basedOnRevisionId} is not null and ${table.processingRunId} is null)`,
    ),
    check("meeting_transcript_revision_number_check", sql`${table.revision} > 0`),
    uniqueIndex("meeting_transcript_revision_meeting_revision_uq").on(
      table.meetingId,
      table.revision,
    ),
    uniqueIndex("meeting_transcript_revision_id_meeting_org_uq").on(
      table.id,
      table.meetingId,
      table.organizationId,
    ),
    uniqueIndex("meeting_transcript_revision_machine_input_uq")
      .on(
        table.meetingId,
        table.sourceManifestSha256,
        table.provider,
        table.model,
        table.region,
        table.pipelineVersion,
      )
      .where(sql`${table.kind} = 'final'`),
    index("meeting_transcript_revision_based_on_idx").on(table.basedOnRevisionId),
    index("meeting_transcript_revision_org_created_idx").on(table.organizationId, table.createdAt),
  ],
);

export const meetingTranscriptTurn = pgTable(
  "meeting_transcript_turn",
  {
    confidence: doublePrecision("confidence"),
    endMs: integer("end_ms").notNull(),
    id: text("id").primaryKey(),
    revisionId: text("revision_id")
      .notNull()
      .references(() => meetingTranscriptRevision.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    speakerDisplayName: text("speaker_display_name"),
    speakerKey: text("speaker_key").notNull(),
    startMs: integer("start_ms").notNull(),
    text: text("text").notNull(),
    track: text("track").notNull(),
  },
  (table) => [
    check("meeting_transcript_turn_sequence_check", sql`${table.sequence} >= 0`),
    check("meeting_transcript_turn_time_check", sql`${table.endMs} > ${table.startMs}`),
    check("meeting_transcript_turn_track_check", sql`${table.track} in ('local', 'remote')`),
    uniqueIndex("meeting_transcript_turn_revision_sequence_uq").on(
      table.revisionId,
      table.sequence,
    ),
    index("meeting_transcript_turn_revision_time_idx").on(
      table.revisionId,
      table.startMs,
      table.endMs,
    ),
  ],
);

export const meetingIntelligenceRevision = pgTable(
  "meeting_intelligence_revision",
  {
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetingSession.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    processingRunId: text("processing_run_id")
      .notNull()
      .unique()
      .references(() => meetingProcessingRun.id, { onDelete: "restrict" }),
    promptVersion: text("prompt_version").notNull(),
    provider: text("provider").notNull(),
    revision: integer("revision").notNull(),
    templateKey: text("template_key").notNull(),
    transcriptRevisionId: text("transcript_revision_id")
      .notNull()
      .references(() => meetingTranscriptRevision.id, { onDelete: "restrict" }),
  },
  (table) => [
    check("meeting_intelligence_revision_number_check", sql`${table.revision} > 0`),
    check(
      "meeting_intelligence_revision_template_check",
      sql`${table.templateKey} in ('general', 'recruiting-interview')`,
    ),
    foreignKey({
      columns: [table.meetingId, table.organizationId],
      foreignColumns: [meetingSession.id, meetingSession.organizationId],
      name: "meeting_intelligence_revision_meeting_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.processingRunId, table.meetingId, table.organizationId],
      foreignColumns: [
        meetingProcessingRun.id,
        meetingProcessingRun.meetingId,
        meetingProcessingRun.organizationId,
      ],
      name: "meeting_intelligence_revision_run_meeting_org_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.transcriptRevisionId, table.meetingId, table.organizationId],
      foreignColumns: [
        meetingTranscriptRevision.id,
        meetingTranscriptRevision.meetingId,
        meetingTranscriptRevision.organizationId,
      ],
      name: "meeting_intelligence_revision_transcript_meeting_org_fk",
    }).onDelete("restrict"),
    uniqueIndex("meeting_intelligence_revision_meeting_revision_uq").on(
      table.meetingId,
      table.revision,
    ),
    index("meeting_intelligence_revision_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("meeting_intelligence_revision_transcript_idx").on(table.transcriptRevisionId),
  ],
);

export const meetingTranscriptionChunk = pgTable(
  "meeting_transcription_chunk",
  {
    chunkIndex: integer("chunk_index").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    endMs: integer("end_ms").notNull(),
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetingSession.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    pipelineVersion: text("pipeline_version").notNull(),
    policyRevision: integer("policy_revision").notNull(),
    processingRunId: text("processing_run_id").references(() => meetingProcessingRun.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    region: text("region").notNull(),
    sourceManifestSha256: text("source_manifest_sha256").notNull(),
    startMs: integer("start_ms").notNull(),
    status: text("status").notNull(),
    track: text("track").notNull(),
    transcript: jsonb("transcript"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("meeting_transcription_chunk_index_check", sql`${table.chunkIndex} >= 0`),
    check("meeting_transcription_chunk_time_check", sql`${table.endMs} > ${table.startMs}`),
    check(
      "meeting_transcription_chunk_track_check",
      sql`${table.track} in ('microphone', 'system')`,
    ),
    check(
      "meeting_transcription_chunk_status_check",
      sql`${table.status} in ('processing', 'succeeded', 'failed')`,
    ),
    check(
      "meeting_transcription_chunk_result_check",
      sql`(${table.status} = 'succeeded') = (${table.transcript} is not null)`,
    ),
    uniqueIndex("meeting_transcription_chunk_input_uq").on(
      table.meetingId,
      table.sourceManifestSha256,
      table.policyRevision,
      table.provider,
      table.model,
      table.region,
      table.pipelineVersion,
      table.track,
      table.chunkIndex,
      table.startMs,
      table.endMs,
    ),
  ],
);

export const meetingRecordingAsset = pgTable(
  "meeting_recording_asset",
  {
    contentType: text("content_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    durationMs: integer("duration_ms").notNull(),
    fragmentCount: integer("fragment_count").notNull(),
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetingSession.id, { onDelete: "cascade" }),
    multipartParts: jsonb("multipart_parts").$type<
      {
        md5Base64: string;
        offsetBytes: number;
        partNumber: number;
        sizeBytes: number;
      }[]
    >(),
    multipartUploadId: text("multipart_upload_id"),
    sha256: text("sha256").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    status: text("status").default("uploading").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    track: text("track").notNull(),
    uploadMode: text("upload_mode").default("single").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("meeting_recording_asset_meeting_track_uq").on(table.meetingId, table.track),
    index("meeting_recording_asset_meeting_idx").on(table.meetingId),
  ],
);

export const meetingAccessGrant = pgTable(
  "meeting_access_grant",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetingSession.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    check("meeting_access_grant_role_check", sql`${table.role} in ('editor', 'viewer')`),
    uniqueIndex("meeting_access_grant_meeting_member_uq").on(table.meetingId, table.memberId),
    index("meeting_access_grant_org_member_idx").on(table.organizationId, table.memberId),
  ],
);

export const meetingNote = pgTable(
  "meeting_note",
  {
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetingSession.id, { onDelete: "cascade" }),
    meetingTimeMs: integer("meeting_time_ms").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    check("meeting_note_time_check", sql`${table.meetingTimeMs} >= 0`),
    index("meeting_note_meeting_time_idx").on(table.meetingId, table.meetingTimeMs),
    index("meeting_note_org_author_idx").on(table.organizationId, table.authorId),
  ],
);

export const meetingAuditLog = pgTable(
  "meeting_audit_log",
  {
    action: text("action").notNull(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    id: text("id").primaryKey(),
    meetingId: text("meeting_id").references(() => meetingSession.id, { onDelete: "set null" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("meeting_audit_log_meeting_created_idx").on(table.meetingId, table.createdAt),
    index("meeting_audit_log_org_created_idx").on(table.organizationId, table.createdAt),
  ],
);

export const organizationRole = pgTable(
  "organization_role",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
    role: text("role").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("organization_role_org_role_uq").on(table.organizationId, table.role),
    index("organization_role_organization_idx").on(table.organizationId),
  ],
);

export const recruitingGroup = pgTable(
  "recruiting_group",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    id: text("id").primaryKey(),
    isDefault: boolean("is_default").default(false).notNull(),
    name: text("name").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("recruiting_group_org_name_uq").on(table.organizationId, table.name),
    uniqueIndex("recruiting_group_org_default_uq")
      .on(table.organizationId)
      .where(sql`${table.isDefault} = true`),
    index("recruiting_group_org_idx").on(table.organizationId),
  ],
);

export const recruitingGroupMember = pgTable(
  "recruiting_group_member",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    groupId: text("group_id")
      .notNull()
      .references(() => recruitingGroup.id, { onDelete: "cascade" }),
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("recruiting_group_member_org_group_user_uq").on(
      table.organizationId,
      table.groupId,
      table.userId,
    ),
    index("recruiting_group_member_org_user_idx").on(table.organizationId, table.userId),
    index("recruiting_group_member_org_group_role_user_idx").on(
      table.organizationId,
      table.groupId,
      table.role,
      table.userId,
    ),
  ],
);

export const workspaceInviteLink = pgTable(
  "workspace_invite_link",
  {
    code: text("code").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    disabledBy: text("disabled_by").references(() => user.id, { onDelete: "set null" }),
    id: text("id").primaryKey(),
    initialRole: text("initial_role").default("noAccess").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
  },
  (table) => [index("workspace_invite_link_org_idx").on(table.organizationId, table.disabledAt)],
);

export const invitation = pgTable(
  "invitation",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
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
    // 候选人期望（薪资 / 现 base / 最早入职日 / 备注），单行 JSONB；
    // 在 offer 阶段录入，便于 dialog prefill。结构见 candidateExpectationsMetaSchema。
    // Candidate-expectations JSON, populated during the offer flow.
    candidateExpectationsMeta: jsonb(
      "candidate_expectations_meta",
    ).$type<CandidateExpectationsMeta | null>(),
    candidateName: text("candidate_name").notNull(),
    candidatePhone: text("candidate_phone"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    // 结案元数据：分类、内部备注、对外反馈话术、录用细节、淘汰细节、previousStage。
    // 结构见 closedMetaSchema；reactivate 时读 previousStage 恢复阶段。
    // Closed-stage JSON metadata; previousStage drives reactivation restore.
    closedMeta: jsonb("closed_meta").$type<ClosedMeta | null>(),
    // ⚠️ DEPRECATED — 旧 closedReason 字段被 closedMeta.internalNotes 取代。
    // Superseded by closedMeta; kept for backwards compat.
    closedReason: text("closed_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    hrResumeAssessment: text("hr_resume_assessment"),
    hrResumeAssessmentUpdatedAt: timestamp("hr_resume_assessment_updated_at", {
      withTimezone: true,
    }),
    hrResumeAssessmentUpdatedBy: text("hr_resume_assessment_updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    // ⚠️ DEPRECATED — 真人复面信息现在落到 studioHumanInterviewRound 子表（多轮 + 多面试官）。
    // 这两列留着兜底但应用层不再写入。
    // Superseded by studioHumanInterviewRound subtable; not written anymore.
    humanInterviewScheduledAt: timestamp("human_interview_scheduled_at", { withTimezone: true }),
    humanInterviewerId: text("human_interviewer_id").references(() => user.id, {
      onDelete: "set null",
    }),
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
    // ⚠️ DEPRECATED — Offer 信息现在落到 studioOfferDraft 子表（多版本 + 议价历史）。
    // Superseded by studioOfferDraft subtable; not written anymore.
    offerAcceptedAt: timestamp("offer_accepted_at", { withTimezone: true }),
    offerSentAt: timestamp("offer_sent_at", { withTimezone: true }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
    // 新模型：候选人最终结论（默认 in_pipeline）。
    // outcome != 'in_pipeline' ⇔ pipelineStage = 'closed'（DB CHECK 强制）。
    // Verdict axis; CHECK constraint pairs non-'in_pipeline' with stage='closed'.
    outcome: text("outcome").$type<CandidateOutcome>().notNull().default("in_pipeline"),
    // 新模型：候选人所在 pipeline 阶段（默认 screening）。
    // default 让 prod 旧 INSERT 路径不传值时也能写入。
    // Stage axis; default lets pre-migration INSERTs succeed.
    pipelineStage: text("pipeline_stage").$type<PipelineStage>().notNull().default("screening"),
    resumeContentHash: text("resume_content_hash"),
    resumeEvaluationArtifactMode: text(
      "resume_evaluation_artifact_mode",
    ).$type<JobEvaluationMode>(),
    resumeEvaluationAttemptMode: text("resume_evaluation_attempt_mode").$type<JobEvaluationMode>(),
    resumeEvaluationStatus: text("resume_evaluation_status").$type<ResumeEvaluationStatus>(),
    resumeFileName: text("resume_file_name"),
    resumeParseError: text("resume_parse_error"),
    resumeParseStatus: text("resume_parse_status")
      .$type<ResumeParseStatus>()
      .notNull()
      .default("ready"),
    resumeParsedAt: timestamp("resume_parsed_at", { withTimezone: true }),
    resumeProfile: jsonb("resume_profile").$type<ResumeProfile | null>(),
    resumeReview: jsonb("resume_review").$type<ResumeReview | null>(),
    resumeReviewError: text("resume_review_error"),
    resumeReviewGeneratedAt: timestamp("resume_review_generated_at", { withTimezone: true }),
    resumeReviewQueuedAt: timestamp("resume_review_queued_at", { withTimezone: true }),
    resumeReviewRunId: text("resume_review_run_id"),
    resumeReviewStatus: text("resume_review_status")
      .$type<ResumeReviewStatus>()
      .notNull()
      .default("idle"),
    resumeScreeningError: text("resume_screening_error"),
    resumeScreeningEvaluatedAt: timestamp("resume_screening_evaluated_at", { withTimezone: true }),
    resumeScreeningResult: jsonb("resume_screening_result").$type<Record<string, unknown> | null>(),
    resumeScreeningStatus: text("resume_screening_status")
      .$type<ResumeScreeningStatus>()
      .notNull()
      .default("idle"),
    // 简历进入招聘台的来源。直传 / 我的简历池 / 公共简历池 / 聊天入库 / API 入库。
    // Source metadata for resume-library rows; keeps the existing workflow
    // intact while preserving provenance for pool imports.
    resumeSourceImportedAt: timestamp("resume_source_imported_at", { withTimezone: true }),
    resumeSourceImportedBy: text("resume_source_imported_by").references(() => user.id, {
      onDelete: "set null",
    }),
    // oxlint-disable-next-line no-use-before-define -- drizzle-orm resolves refs lazily at runtime
    resumeSourcePoolItemId: text("resume_source_pool_item_id").references(() => resumePoolItem.id, {
      onDelete: "set null",
    }),
    resumeSourceType: text("resume_source_type").$type<StudioInterviewResumeSourceType>(),
    resumeStorageKey: text("resume_storage_key"),
    resumeText: text("resume_text"),
    // 派生自 resume_profile->'skills'：trim + 连续空白折叠为单空格 + lowercase 后的数组。
    // GIN 索引支持 `@>` 包含匹配。display 形态保存在 studioOrgSkill 表里，每 org 一份。
    // Derived from resume_profile->'skills': trim + collapse whitespace + lowercase.
    // GIN-indexed so `@>` contains-all matching is index-driven. Display strings
    // live once per org in studioOrgSkill, not duplicated per candidate.
    skillsNormalized: text("skills_normalized")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    structuredCompositeScore: integer("structured_composite_score"),
    structuredGateSortRank: integer("structured_gate_sort_rank"),
    structuredGateStatus: text("structured_gate_status").$type<StructuredResumeGateStatus>(),
    structuredResumeEvaluation: jsonb(
      "structured_resume_evaluation",
    ).$type<StructuredResumeEvaluationV1 | null>(),
    structuredScoreGrade: text("structured_score_grade").$type<StructuredResumeGrade>(),
    targetRole: text("target_role"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    // ⚠️ 笔试阶段当前在 tabs 中隐藏（UI 没建）；这两列暂存，未来真要做笔试时再决定保留 / 子表化。
    // Written-test scalars; the stage is hidden in UI for now, columns reserved.
    writtenTestScheduledAt: timestamp("written_test_scheduled_at", { withTimezone: true }),
    writtenTestScore: text("written_test_score"),
  },
  (table) => [
    // 新模型的索引：tabs 通常 WHERE pipeline_stage = ? AND outcome = ?。
    index("studio_interview_pipeline_stage_idx").on(table.pipelineStage),
    index("studio_interview_outcome_idx").on(table.outcome),
    index("studio_interview_stage_outcome_idx").on(table.pipelineStage, table.outcome),
    index("studio_interview_created_at_idx").on(table.createdAt),
    index("studio_interview_created_by_idx").on(table.createdBy),
    index("studio_interview_job_description_idx").on(table.jobDescriptionId),
    index("studio_interview_organization_idx").on(table.organizationId),
    index("studio_interview_org_created_at_idx").on(table.organizationId, table.createdAt),
    uniqueIndex("studio_interview_id_org_uq").on(table.id, table.organizationId),
    index("studio_interview_org_created_by_created_at_idx").on(
      table.organizationId,
      table.createdBy,
      table.createdAt,
    ),
    index("studio_interview_org_stage_created_at_idx").on(
      table.organizationId,
      table.pipelineStage,
      table.createdAt,
    ),
    index("studio_interview_resume_content_hash_idx").on(table.resumeContentHash),
    check(
      "studio_interview_resume_evaluation_status_check",
      sql`${table.resumeEvaluationStatus} IS NULL OR ${table.resumeEvaluationStatus} IN ('pass', 'fail')`,
    ),
    check(
      "studio_interview_resume_evaluation_artifact_mode_check",
      sql`${table.resumeEvaluationArtifactMode} IS NULL OR ${table.resumeEvaluationArtifactMode} IN ('legacy', 'structured')`,
    ),
    check(
      "studio_interview_resume_evaluation_attempt_mode_check",
      sql`${table.resumeEvaluationAttemptMode} IS NULL OR ${table.resumeEvaluationAttemptMode} IN ('legacy', 'structured')`,
    ),
    index("studio_interview_resume_parse_status_idx").on(table.resumeParseStatus),
    index("studio_interview_resume_source_pool_item_idx").on(table.resumeSourcePoolItemId),
    index("studio_interview_resume_source_type_idx").on(table.resumeSourceType),
    index("studio_interview_skills_normalized_idx")
      .using("gin", table.skillsNormalized)
      .concurrently(),
    check(
      "studio_interview_structured_evaluation_complete_check",
      sql`(
        ${table.structuredResumeEvaluation} IS NULL
        AND ${table.structuredCompositeScore} IS NULL
        AND ${table.structuredScoreGrade} IS NULL
        AND ${table.structuredGateStatus} IS NULL
        AND ${table.structuredGateSortRank} IS NULL
      ) OR (
        ${table.structuredResumeEvaluation} IS NOT NULL
        AND ${table.structuredCompositeScore} BETWEEN 0 AND 100
        AND ${table.structuredScoreGrade} IN ('recommended', 'matched', 'unmatched')
        AND ${table.structuredGateStatus} IN ('passed', 'needs_verification', 'failed')
        AND ${table.structuredGateSortRank} IN (0, 1, 2)
      )`,
    ),
    check(
      "studio_interview_structured_gate_rank_check",
      sql`(${table.structuredGateStatus}, ${table.structuredGateSortRank}) IN (
        ('passed', 0),
        ('needs_verification', 1),
        ('failed', 2)
      ) OR (
        ${table.structuredGateStatus} IS NULL
        AND ${table.structuredGateSortRank} IS NULL
      )`,
    ),
    index("studio_interview_structured_job_order_idx").on(
      table.organizationId,
      table.jobDescriptionId,
      table.structuredGateSortRank.asc(),
      table.structuredCompositeScore.desc(),
    ),
  ],
);

export type StudioInterviewResumeSourceType =
  | "direct_upload"
  | "private_pool"
  | "public_pool"
  | "chat_import"
  | "api_import";

// 每组织的技能 canonical 表：
// - `normalized` 是归一化键（lowercase + 折叠空白），作为 PK 的一部分
// - `display` 保留 UI 展示用的原始大小写写法；每个 normalized 全 org 只存一次
// - `candidateCount` 由 syncResumeSkills 维护（增减时增量 ± 1），DELETE 由触发器兜底
// - `aliasOf` 为 Phase 2 同义词预留：null 表示自身即规范名
//
// Per-org canonical skill table:
// - `normalized` is the matching key (lowercase + collapsed spaces)
// - `display` holds the UI form; stored once per org rather than once per candidate
// - `candidateCount` is maintained by syncResumeSkills (delta on every write);
//   a BEFORE DELETE trigger on studio_interview decrements when rows are cascaded
// - `aliasOf` reserves space for Phase 2 synonyms (TS → TypeScript); null means
//   this row is its own canonical
export const studioOrgSkill = pgTable(
  "studio_org_skill",
  {
    aliasOf: text("alias_of"),
    candidateCount: integer("candidate_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    display: text("display").notNull(),
    normalized: text("normalized").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.normalized] }),
    index("studio_org_skill_count_idx").on(table.organizationId, table.candidateCount),
  ],
);

export const department = pgTable(
  "department",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    description: text("description"),
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
    updatedAt: timestamp("updated_at", { withTimezone: true })
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

export const minimaxVoicePreview = pgTable(
  "minimax_voice_preview",
  {
    contentType: text("content_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    format: text("format").notNull(),
    id: text("id").primaryKey(),
    model: text("model").notNull(),
    previewText: text("preview_text").notNull(),
    previewTextHash: text("preview_text_hash").notNull(),
    publicUrl: text("public_url").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    voice: text("voice").$type<MinimaxVoiceId>().notNull(),
  },
  (table) => [
    uniqueIndex("minimax_voice_preview_unique_idx").on(
      table.voice,
      table.previewTextHash,
      table.model,
      table.format,
    ),
    index("minimax_voice_preview_voice_idx").on(table.voice),
  ],
);

export const jobDescription = pgTable(
  "job_description",
  {
    allowCrossDepartmentInterviewers: boolean("allow_cross_department_interviewers")
      .default(false)
      .notNull(),
    code: text("code"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    deductionRuleSetVersion: integer("deduction_rule_set_version"),
    departmentId: text("department_id")
      .notNull()
      .references(() => department.id, { onDelete: "restrict" }),
    description: text("description"),
    evaluationBlueprint: jsonb("evaluation_blueprint").$type<JobEvaluationBlueprint | null>(),
    evaluationBlueprintHash: text("evaluation_blueprint_hash"),
    evaluationBlueprintPreview: jsonb(
      "evaluation_blueprint_preview",
    ).$type<JobEvaluationBlueprint | null>(),
    evaluationBlueprintPreviewGeneratedAt: timestamp("evaluation_blueprint_preview_generated_at", {
      withTimezone: true,
    }),
    evaluationBlueprintPreviewHash: text("evaluation_blueprint_preview_hash"),
    evaluationBlueprintPreviewInputHash: text("evaluation_blueprint_preview_input_hash"),
    evaluationBlueprintSchemaVersion: integer("evaluation_blueprint_schema_version"),
    evaluationMode: text("evaluation_mode")
      .$type<JobEvaluationMode>()
      .notNull()
      .default("structured"),
    evaluationUpgradedAt: timestamp("evaluation_upgraded_at", { withTimezone: true }),
    evaluationUpgradedBy: text("evaluation_upgraded_by").references(() => user.id, {
      onDelete: "set null",
    }),
    feishuChatBoundAt: timestamp("feishu_chat_bound_at", { withTimezone: true }),
    feishuChatBoundBy: text("feishu_chat_bound_by").references(() => user.id, {
      onDelete: "set null",
    }),
    feishuChatId: text("feishu_chat_id"),
    id: text("id").primaryKey(),
    lifecycleStatus: text("lifecycle_status")
      .$type<JobLifecycleStatus>()
      .notNull()
      .default("draft"),
    name: text("name").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
    presetQuestions: jsonb("preset_questions").$type<string[]>().notNull().default([]),
    prompt: text("prompt").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    resumeScreeningPolicy: jsonb("resume_screening_policy").$type<Record<string, unknown> | null>(),
    resumeScreeningPolicyHash: text("resume_screening_policy_hash"),
    resumeScreeningPolicyVersion: integer("resume_screening_policy_version").notNull().default(1),
    structuredConfig: jsonb("structured_config")
      .$type<JobDescriptionStructuredConfig>()
      .notNull()
      .default(createDefaultJobDescriptionStructuredConfig()),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("job_description_department_idx").on(table.departmentId),
    index("job_description_name_idx").on(table.name),
    index("job_description_created_at_idx").on(table.createdAt),
    index("job_description_organization_idx").on(table.organizationId),
    uniqueIndex("job_description_org_code_uq")
      .on(table.organizationId, table.code)
      .where(sql`${table.code} IS NOT NULL`),
    check(
      "job_description_evaluation_mode_check",
      sql`${table.evaluationMode} IN ('legacy', 'structured')`,
    ),
    check(
      "job_description_lifecycle_status_check",
      sql`${table.lifecycleStatus} IN ('draft', 'published')`,
    ),
    check(
      "job_description_evaluation_lifecycle_check",
      sql`(
        ${table.evaluationMode} = 'legacy'
        AND ${table.lifecycleStatus} = 'published'
        AND ${table.publishedAt} IS NOT NULL
        AND ${table.evaluationBlueprintPreview} IS NULL
        AND ${table.evaluationBlueprintPreviewInputHash} IS NULL
        AND ${table.evaluationBlueprintPreviewHash} IS NULL
        AND ${table.evaluationBlueprintPreviewGeneratedAt} IS NULL
        AND ${table.evaluationBlueprint} IS NULL
        AND ${table.evaluationBlueprintHash} IS NULL
        AND ${table.evaluationBlueprintSchemaVersion} IS NULL
        AND ${table.deductionRuleSetVersion} IS NULL
      ) OR (
        ${table.evaluationMode} = 'structured'
        AND ${table.lifecycleStatus} = 'draft'
        AND ${table.publishedAt} IS NULL
        AND ${table.evaluationBlueprint} IS NULL
        AND ${table.evaluationBlueprintHash} IS NULL
        AND ${table.evaluationBlueprintSchemaVersion} IS NULL
        AND ${table.deductionRuleSetVersion} IS NULL
        AND (
          (
            ${table.evaluationBlueprintPreview} IS NULL
            AND ${table.evaluationBlueprintPreviewInputHash} IS NULL
            AND ${table.evaluationBlueprintPreviewHash} IS NULL
            AND ${table.evaluationBlueprintPreviewGeneratedAt} IS NULL
          ) OR (
            ${table.evaluationBlueprintPreview} IS NOT NULL
            AND ${table.evaluationBlueprintPreviewInputHash} IS NOT NULL
            AND ${table.evaluationBlueprintPreviewHash} IS NOT NULL
            AND ${table.evaluationBlueprintPreviewGeneratedAt} IS NOT NULL
          )
        )
      ) OR (
        ${table.evaluationMode} = 'structured'
        AND ${table.lifecycleStatus} = 'published'
        AND ${table.publishedAt} IS NOT NULL
        AND ${table.evaluationBlueprint} IS NOT NULL
        AND ${table.evaluationBlueprintHash} IS NOT NULL
        AND ${table.evaluationBlueprintSchemaVersion} IS NOT NULL
        AND ${table.deductionRuleSetVersion} IS NOT NULL
        AND ${table.evaluationBlueprintPreview} IS NULL
        AND ${table.evaluationBlueprintPreviewInputHash} IS NULL
        AND ${table.evaluationBlueprintPreviewHash} IS NULL
        AND ${table.evaluationBlueprintPreviewGeneratedAt} IS NULL
      )`,
    ),
  ],
);

export const jobDescriptionEvaluationUpgradeDraft = pgTable(
  "job_description_evaluation_upgrade_draft",
  {
    blueprintPreview: jsonb("blueprint_preview").$type<JobEvaluationBlueprint | null>(),
    blueprintPreviewGeneratedAt: timestamp("blueprint_preview_generated_at", {
      withTimezone: true,
    }),
    blueprintPreviewHash: text("blueprint_preview_hash"),
    blueprintPreviewInputHash: text("blueprint_preview_input_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    id: text("id").primaryKey(),
    jobDescriptionId: text("job_description_id")
      .notNull()
      .references(() => jobDescription.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    structuredConfig: jsonb("structured_config").$type<JobDescriptionStructuredConfig>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    uniqueIndex("job_description_evaluation_upgrade_draft_job_uq").on(table.jobDescriptionId),
    index("job_description_evaluation_upgrade_draft_org_idx").on(table.organizationId),
    check(
      "job_description_evaluation_upgrade_draft_preview_check",
      sql`(
        ${table.blueprintPreview} IS NULL
        AND ${table.blueprintPreviewInputHash} IS NULL
        AND ${table.blueprintPreviewHash} IS NULL
        AND ${table.blueprintPreviewGeneratedAt} IS NULL
      ) OR (
        ${table.blueprintPreview} IS NOT NULL
        AND ${table.blueprintPreviewInputHash} IS NOT NULL
        AND ${table.blueprintPreviewHash} IS NOT NULL
        AND ${table.blueprintPreviewGeneratedAt} IS NOT NULL
      )`,
    ),
    check("job_description_evaluation_upgrade_draft_version_check", sql`${table.version} > 0`),
  ],
);

export const jobDescriptionEvaluationUpgradeAudit = pgTable(
  "job_description_evaluation_upgrade_audit",
  {
    blueprint: jsonb("blueprint").$type<JobEvaluationBlueprint>().notNull(),
    blueprintHash: text("blueprint_hash").notNull(),
    blueprintSchemaVersion: integer("blueprint_schema_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    deductionRuleSetVersion: integer("deduction_rule_set_version").notNull(),
    draftVersion: integer("draft_version").notNull(),
    id: text("id").primaryKey(),
    jobDescriptionId: text("job_description_id")
      .notNull()
      .references(() => jobDescription.id, { onDelete: "cascade" }),
    legacySnapshot: jsonb("legacy_snapshot").$type<Record<string, unknown>>().notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    structuredConfig: jsonb("structured_config").$type<JobDescriptionStructuredConfig>().notNull(),
    upgradedBy: text("upgraded_by").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    index("job_description_evaluation_upgrade_audit_job_idx").on(
      table.jobDescriptionId,
      table.createdAt,
    ),
    index("job_description_evaluation_upgrade_audit_org_idx").on(table.organizationId),
  ],
);

export const jobDescriptionInterviewer = pgTable(
  "job_description_interviewer",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
    candidateFeedbackCategories: jsonb("candidate_feedback_categories").$type<
      CandidateInterviewFeedbackCategory[] | null
    >(),
    candidateFeedbackDetail: text("candidate_feedback_detail"),
    candidateFeedbackSubmittedAt: timestamp("candidate_feedback_submitted_at", {
      withTimezone: true,
    }),
    conversationId: text("conversation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    // 热重连锚点：轮次首次开始时持久化 LiveKit 房间名、参与者 identity、
    // 会话起始时间。断连超过 LiveKit 自动重连窗口时记录 disconnectedAt，
    // 给候选人 3 分钟内回到同一房间继续对话。
    // Hot-reconnect anchor columns: persist the LiveKit room/identity and
    // session start so a candidate can rejoin the same room within 3 minutes
    // after a hard disconnect.
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
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
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    scheduledEndAt: timestamp("scheduled_end_at", { withTimezone: true }),
    sessionStartedAt: timestamp("session_started_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull(),
    status: text("status").$type<ScheduleEntryStatus>().notNull().default("pending"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("studio_interview_schedule_record_idx").on(table.interviewRecordId),
    index("studio_interview_schedule_sort_idx").on(table.interviewRecordId, table.sortOrder),
    index("studio_interview_schedule_organization_idx").on(table.organizationId),
    index("studio_interview_schedule_created_by_idx").on(table.createdBy),
    index("studio_interview_schedule_org_created_at_idx").on(table.organizationId, table.createdAt),
    index("studio_interview_schedule_org_created_by_created_at_idx").on(
      table.organizationId,
      table.createdBy,
      table.createdAt,
    ),
    index("studio_interview_schedule_org_status_created_at_idx").on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
  ],
);

// 真人复面单轮记录。一名候选人可以多轮（label 例：技术复面/HR 复面/总监终面）。
// status 走 pending → completed/cancelled 终态机；outcome/score/feedback 在完成时填。
// 多面试官走 junction table studioHumanInterviewRoundInterviewer。
//
// Per-round human interview record. Each candidate can have multiple rounds.
// Status: pending → completed/cancelled. Outcome/score/feedback captured on
// completion. Many-to-many interviewers via the junction table below.
export const studioHumanInterviewRound = pgTable(
  "studio_human_interview_round",
  {
    cancelReason: text("cancel_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    feedback: text("feedback"),
    format: text("format").$type<HumanInterviewFormat>().notNull(),
    id: text("id").primaryKey(),
    interviewRecordId: text("interview_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    location: text("location"),
    meetingUrl: text("meeting_url"),
    notes: text("notes"),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    outcome: text("outcome").$type<HumanInterviewRoundOutcome>(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    score: integer("score"),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status").$type<HumanInterviewRoundStatus>().notNull().default("pending"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("studio_human_interview_round_record_idx").on(table.interviewRecordId),
    index("studio_human_interview_round_sort_idx").on(table.interviewRecordId, table.sortOrder),
    index("studio_human_interview_round_org_idx").on(table.organizationId),
    index("studio_human_interview_round_status_idx").on(table.status),
  ],
);

// 真人复面会议：一场会议对应一个 LiveKit room，可包含多个候选人的 round 和多个面试官。
// 评价结果仍然写在 studioHumanInterviewRound；这里仅保存会议级生命周期/录制信息。
//
// Human-interview meeting. One meeting maps to one LiveKit room and can include
// multiple candidate rounds plus multiple interviewers. Per-candidate verdicts
// remain on studioHumanInterviewRound.
export const studioHumanInterviewMeeting = pgTable(
  "studio_human_interview_meeting",
  {
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    feishuAppLink: text("feishu_app_link"),
    feishuAttendeeOpenIds: jsonb("feishu_attendee_open_ids").$type<string[]>(),
    feishuCalendarEventId: text("feishu_calendar_event_id"),
    feishuCalendarEventUrl: text("feishu_calendar_event_url"),
    feishuCalendarId: text("feishu_calendar_id"),
    feishuLastError: text("feishu_last_error"),
    feishuMeetingNo: text("feishu_meeting_no"),
    feishuMeetingUrl: text("feishu_meeting_url"),
    feishuOwnerOpenId: text("feishu_owner_open_id"),
    feishuProviderId: text("feishu_provider_id").$type<FeishuHumanInterviewProviderId>(),
    feishuReserveId: text("feishu_reserve_id"),
    feishuSyncStatus: text("feishu_sync_status").$type<FeishuHumanInterviewSyncStatus>(),
    feishuSyncedAt: timestamp("feishu_synced_at", { withTimezone: true }),
    id: text("id").primaryKey(),
    liveKitRoomName: text("livekit_room_name"),
    notes: text("notes"),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    recordingEgressId: text("recording_egress_id"),
    recordingFileKey: text("recording_file_key"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    status: text("status").$type<HumanInterviewMeetingStatus>().notNull().default("scheduled"),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    validUntil: timestamp("valid_until", { withTimezone: true }),
  },
  (table) => [
    index("studio_human_interview_meeting_org_idx").on(table.organizationId),
    index("studio_human_interview_meeting_schedule_idx").on(
      table.organizationId,
      table.scheduledAt,
    ),
    index("studio_human_interview_meeting_status_idx").on(table.organizationId, table.status),
    uniqueIndex("studio_human_interview_meeting_livekit_room_idx").on(table.liveKitRoomName),
  ],
);

// 会议 ↔ 候选人轮次 junction。每个 round 仍然指向 studio_interview 简历/候选人记录；
// 这里承载候选人参加同一场会议的邀请和入离会时间。
//
// Meeting ↔ candidate-round junction. The round itself links back to the resume
// record; this table stores candidate-specific invite/join metadata for the meeting.
export const studioHumanInterviewMeetingRound = pgTable(
  "studio_human_interview_meeting_round",
  {
    candidateInviteExpiresAt: timestamp("candidate_invite_expires_at", { withTimezone: true }),
    candidateInviteTokenHash: text("candidate_invite_token_hash"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => studioHumanInterviewMeeting.id, { onDelete: "cascade" }),
    roundId: text("round_id")
      .notNull()
      .references(() => studioHumanInterviewRound.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.meetingId, table.roundId] }),
    index("studio_human_interview_meeting_round_round_idx").on(table.roundId),
    uniqueIndex("studio_human_interview_meeting_round_invite_token_idx").on(
      table.candidateInviteTokenHash,
    ),
  ],
);

// 会议 ↔ 面试官 junction。保留 role 以支持主持人/旁听者等会议级权限。
// Meeting ↔ interviewer junction. role leaves room for host/observer permissions.
export const studioHumanInterviewMeetingInterviewer = pgTable(
  "studio_human_interview_meeting_interviewer",
  {
    feishuOpenId: text("feishu_open_id"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => studioHumanInterviewMeeting.id, { onDelete: "cascade" }),
    role: text("role")
      .$type<HumanInterviewMeetingInterviewerRole>()
      .notNull()
      .default("interviewer"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.meetingId, table.userId] }),
    index("studio_human_interview_meeting_interviewer_user_idx").on(table.userId),
  ],
);

// 真人复面面试官 junction：(roundId, userId) 复合 PK；删用户级联，删轮次级联。
// 单独索引 userId 让「查询某面试官面过的所有候选人」走索引。
// Junction for (round, interviewer) many-to-many. userId index supports the
// "all rounds interviewed by user X" query.
export const studioHumanInterviewRoundInterviewer = pgTable(
  "studio_human_interview_round_interviewer",
  {
    roundId: text("round_id")
      .notNull()
      .references(() => studioHumanInterviewRound.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.roundId, table.userId] }),
    index("studio_human_interview_round_interviewer_user_idx").on(table.userId),
  ],
);

// Offer 草稿（多版本）。version 在同一候选人内单调递增；新版本发出时旧版置 superseded。
// status 状态机：draft → sent → (accepted/declined/expired)；任意态都可被 superseded。
// 候选人议价记在 candidateCounter（自由文本，描述本版回复内容）。
//
// Versioned offer drafts. Version is monotonically increasing per candidate;
// new versions supersede earlier ones. Status: draft → sent → terminal.
// Candidate counter-offers recorded as free text on the draft they respond to.
export const studioOfferDraft = pgTable(
  "studio_offer_draft",
  {
    baseSalary: integer("base_salary").notNull(),
    bonus: integer("bonus"),
    candidateCounter: text("candidate_counter"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    currency: text("currency").notNull().default("CNY"),
    equity: text("equity"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    id: text("id").primaryKey(),
    interviewRecordId: text("interview_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    joiningDate: timestamp("joining_date", { withTimezone: true }),
    notes: text("notes"),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    position: text("position").notNull(),
    responseAt: timestamp("response_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    status: text("status").$type<OfferDraftStatus>().notNull().default("draft"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    version: integer("version").notNull(),
  },
  (table) => [
    uniqueIndex("studio_offer_draft_record_version_uniq").on(
      table.interviewRecordId,
      table.version,
    ),
    index("studio_offer_draft_record_idx").on(table.interviewRecordId),
    index("studio_offer_draft_org_idx").on(table.organizationId),
    index("studio_offer_draft_status_idx").on(table.status),
  ],
);

export type ResumePoolScope = "private" | "public";
export type ResumePoolStatus = "active" | "archived";
export type ResumePoolSourceChannel = "mail_ingest" | "referral";
export type ResumePoolEventType =
  | "created"
  | "parsed"
  | "published"
  | "imported"
  | "bound"
  | "archived"
  | "restored";

export const resumePoolItem = pgTable(
  "resume_pool_item",
  {
    candidateEmail: text("candidate_email"),
    candidateName: text("candidate_name").notNull(),
    candidatePhone: text("candidate_phone"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    id: text("id").primaryKey(),
    jobDescriptionId: text("job_description_id").references(() => jobDescription.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: text("published_by").references(() => user.id, { onDelete: "set null" }),
    resumeContentHash: text("resume_content_hash"),
    resumeFileName: text("resume_file_name"),
    resumeParseError: text("resume_parse_error"),
    resumeParseStatus: text("resume_parse_status")
      .$type<ResumeParseStatus>()
      .notNull()
      .default("ready"),
    resumeParsedAt: timestamp("resume_parsed_at", { withTimezone: true }),
    resumeProfile: jsonb("resume_profile").$type<ResumeProfile | null>(),
    resumeStorageKey: text("resume_storage_key"),
    resumeText: text("resume_text"),
    scope: text("scope").$type<ResumePoolScope>().notNull(),
    skillsNormalized: text("skills_normalized")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    sourceChannel: text("source_channel").$type<ResumePoolSourceChannel>(),
    sourceOrganizationId: text("source_organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    sourcePoolItemId: text("source_pool_item_id"),
    sourceUserId: text("source_user_id").references(() => user.id, { onDelete: "set null" }),
    status: text("status").$type<ResumePoolStatus>().notNull().default("active"),
    targetRole: text("target_role"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("resume_pool_item_scope_created_idx").on(table.scope, table.createdAt),
    index("resume_pool_item_org_user_scope_created_idx").on(
      table.organizationId,
      table.createdBy,
      table.scope,
      table.createdAt,
    ),
    index("resume_pool_item_resume_content_hash_idx").on(table.resumeContentHash),
    index("resume_pool_item_resume_parse_status_idx").on(table.resumeParseStatus),
    check(
      "resume_pool_item_source_channel_check",
      sql`${table.sourceChannel} IS NULL OR ${table.sourceChannel} IN ('mail_ingest', 'referral')`,
    ),
    index("resume_pool_item_source_pool_item_idx").on(table.sourcePoolItemId),
    index("resume_pool_item_skills_normalized_idx").using("gin", table.skillsNormalized),
  ],
);

export const referralLink = pgTable(
  "referral_link",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    disabledBy: text("disabled_by").references(() => user.id, { onDelete: "set null" }),
    id: text("id").primaryKey(),
    jobDescriptionId: text("job_description_id")
      .notNull()
      .references(() => jobDescription.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("referral_link_org_jd_creator_idx").on(
      table.organizationId,
      table.jobDescriptionId,
      table.createdBy,
      table.disabledAt,
    ),
    index("referral_link_org_idx").on(table.organizationId, table.disabledAt),
  ],
);

export const resumePoolImport = pgTable(
  "resume_pool_import",
  {
    id: text("id").primaryKey(),
    importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
    importedBy: text("imported_by").references(() => user.id, { onDelete: "set null" }),
    importedResumeRecordId: text("imported_resume_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    poolItemId: text("pool_item_id")
      .notNull()
      .references(() => resumePoolItem.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("resume_pool_import_pool_org_record_uq").on(
      table.poolItemId,
      table.organizationId,
      table.importedResumeRecordId,
    ),
    index("resume_pool_import_pool_org_idx").on(table.poolItemId, table.organizationId),
    index("resume_pool_import_record_idx").on(table.importedResumeRecordId),
  ],
);

export const resumePoolEvent = pgTable(
  "resume_pool_event",
  {
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    id: text("id").primaryKey(),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    payload: jsonb("payload"),
    poolItemId: text("pool_item_id")
      .notNull()
      .references(() => resumePoolItem.id, { onDelete: "cascade" }),
    type: text("type").$type<ResumePoolEventType>().notNull(),
  },
  (table) => [
    index("resume_pool_event_pool_created_idx").on(table.poolItemId, table.createdAt),
    index("resume_pool_event_org_created_idx").on(table.organizationId, table.createdAt),
  ],
);

export type ResumeUploadBatchStatus = "pending" | "running" | "completed" | "cancelled";
export type ResumeUploadBatchJdMode = "bind" | "auto" | "none";
export type ResumeUploadBatchDedupPolicy = "skip" | "create";
export type ResumeUploadBatchTarget = "resume_library" | "resume_pool";
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
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
    resumePoolScope: text("resume_pool_scope").$type<ResumePoolScope>(),
    skippedCount: integer("skipped_count").notNull().default(0),
    status: text("status").$type<ResumeUploadBatchStatus>().notNull(),
    succeededCount: integer("succeeded_count").notNull().default(0),
    target: text("target").$type<ResumeUploadBatchTarget>().notNull().default("resume_library"),
    totalCount: integer("total_count").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
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
  ],
);

export const resumeUploadBatchItem = pgTable(
  "resume_upload_batch_item",
  {
    attemptCount: integer("attempt_count").notNull().default(0),
    batchId: text("batch_id")
      .notNull()
      .references(() => resumeUploadBatch.id, { onDelete: "cascade" }),
    contentHash: text("content_hash"),
    dedupMatchSnapshot: jsonb("dedup_match_snapshot"),
    errorMessage: text("error_message"),
    fileSize: integer("file_size").notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    id: text("id").primaryKey(),
    orderIndex: integer("order_index").notNull(),
    organizationId: text("organization_id").notNull(),
    originalFileName: text("original_file_name").notNull(),
    poolItemId: text("pool_item_id").references(() => resumePoolItem.id, {
      onDelete: "set null",
    }),
    queueJobId: text("queue_job_id"),
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    resumeRecordId: text("resume_record_id").references(() => studioInterview.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    status: text("status").$type<ResumeUploadBatchItemStatus>().notNull(),
    storageKey: text("storage_key").notNull(),
  },
  (table) => [
    index("resume_upload_batch_item_batch_order_idx").on(table.batchId, table.orderIndex),
    index("resume_upload_batch_item_batch_status_idx").on(table.batchId, table.status),
  ],
);

export type MailIngestMessageStatus = "processing" | "queued" | "skipped" | "failed";

export type MailIngestSkipReason = "no_supported_attachment";
export type MailIngestJdBindStatus = "bound" | "unmatched" | "ambiguous" | "fallback";

export type ResumeSemanticSourceType = "resume_pool_item" | "studio_interview" | "job_description";
export type ResumeSemanticIndexStatus = "failed" | "indexed" | "pending" | "skipped" | "stale";
export type ResumeSemanticDuplicateLevel = "high" | "low" | "medium";
export type ResumeDuplicateMatchStatus = "active" | "confirmed" | "dismissed";

export const resumeSemanticIndex = pgTable(
  "resume_semantic_index",
  {
    contentHash: text("content_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    embeddingModel: text("embedding_model").notNull(),
    embeddingVersion: text("embedding_version").notNull(),
    errorMessage: text("error_message"),
    id: text("id").primaryKey(),
    lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    profileHash: text("profile_hash").notNull(),
    sourceId: text("source_id").notNull(),
    sourceType: text("source_type").$type<ResumeSemanticSourceType>().notNull(),
    status: text("status").$type<ResumeSemanticIndexStatus>().notNull().default("pending"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("resume_semantic_index_source_version_uq").on(
      table.sourceType,
      table.sourceId,
      table.embeddingVersion,
    ),
    index("resume_semantic_index_org_status_idx").on(table.organizationId, table.status),
    index("resume_semantic_index_org_source_idx").on(
      table.organizationId,
      table.sourceType,
      table.sourceId,
    ),
  ],
);

export const resumeDuplicateMatch = pgTable(
  "resume_duplicate_match",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    embeddingVersion: text("embedding_version").notNull(),
    id: text("id").primaryKey(),
    level: text("level").$type<ResumeSemanticDuplicateLevel>().notNull(),
    matchedSourceId: text("matched_source_id").notNull(),
    matchedSourceType: text("matched_source_type").$type<ResumeSemanticSourceType>().notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    reasons: jsonb("reasons")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    score: integer("score").notNull(),
    signals: jsonb("signals")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    similarity: jsonb("similarity").$type<{
      resumeOverview?: number;
      skillRole?: number;
      workProject?: number;
    }>(),
    sourceId: text("source_id").notNull(),
    sourceType: text("source_type").$type<ResumeSemanticSourceType>().notNull(),
    status: text("status").$type<ResumeDuplicateMatchStatus>().notNull().default("active"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("resume_duplicate_match_source_target_version_uq").on(
      table.organizationId,
      table.sourceType,
      table.sourceId,
      table.matchedSourceType,
      table.matchedSourceId,
      table.embeddingVersion,
    ),
    index("resume_duplicate_match_org_source_idx").on(
      table.organizationId,
      table.sourceType,
      table.sourceId,
      table.createdAt,
    ),
    index("resume_duplicate_match_org_level_idx").on(table.organizationId, table.level),
    index("resume_duplicate_match_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const mailIngestAccount = pgTable(
  "mail_ingest_account",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    dedupPolicy: text("dedup_policy")
      .$type<ResumeUploadBatchDedupPolicy>()
      .notNull()
      .default("skip"),
    emailAddress: text("email_address").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    encryptedPassword: text("encrypted_password").notNull(),
    failedMailbox: text("failed_mailbox").notNull().default("ARC-Failed"),
    id: text("id").primaryKey(),
    imapHost: text("imap_host").notNull().default("imap.qiye.aliyun.com"),
    imapPort: integer("imap_port").notNull().default(993),
    imapSecure: boolean("imap_secure").default(true).notNull(),
    jdMode: text("jd_mode").$type<ResumeUploadBatchJdMode>().notNull().default("none"),
    jobDescriptionId: text("job_description_id").references(() => jobDescription.id, {
      onDelete: "set null",
    }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastError: text("last_error"),
    lastRunFailed: integer("last_run_failed").notNull().default(0),
    lastRunMatched: integer("last_run_matched").notNull().default(0),
    lastRunQueued: integer("last_run_queued").notNull().default(0),
    lastRunReceived: integer("last_run_received").notNull().default(0),
    lastRunSubjectSkipped: integer("last_run_subject_skipped").notNull().default(0),
    listenStartAt: timestamp("listen_start_at", { withTimezone: true }),
    mailbox: text("mailbox").notNull().default("INBOX"),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    pollingStartedAt: timestamp("polling_started_at", { withTimezone: true }),
    processedMailbox: text("processed_mailbox").notNull().default("ARC-Processed"),
    resumePoolScope: text("resume_pool_scope")
      .$type<ResumePoolScope>()
      .notNull()
      .default("private"),
    subjectKeyword: text("subject_keyword").notNull().default("boss直聘"),
    target: text("target").$type<ResumeUploadBatchTarget>().notNull().default("resume_pool"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
  },
  (table) => [
    uniqueIndex("mail_ingest_account_org_user_email_uq").on(
      table.organizationId,
      table.userId,
      table.emailAddress,
    ),
    index("mail_ingest_account_enabled_idx").on(table.enabled),
    index("mail_ingest_account_org_user_idx").on(table.organizationId, table.userId),
  ],
);

export const mailIngestMessage = pgTable(
  "mail_ingest_message",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => mailIngestAccount.id, { onDelete: "cascade" }),
    attachmentCount: integer("attachment_count"),
    batchId: text("batch_id").references(() => resumeUploadBatch.id, { onDelete: "set null" }),
    boundJobDescriptionId: text("bound_job_description_id").references(() => jobDescription.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    errorMessage: text("error_message"),
    extractedJobCodes: jsonb("extracted_job_codes").$type<string[]>(),
    fromAddress: text("from_address"),
    id: text("id").primaryKey(),
    jdBindStatus: text("jd_bind_status").$type<MailIngestJdBindStatus>(),
    mailbox: text("mailbox").notNull(),
    messageId: text("message_id"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    resumeAttachmentCount: integer("resume_attachment_count"),
    skipReason: text("skip_reason").$type<MailIngestSkipReason>(),
    status: text("status").$type<MailIngestMessageStatus>().notNull(),
    subject: text("subject"),
    uid: text("uid").notNull(),
    uidValidity: text("uid_validity").notNull(),
  },
  (table) => [
    uniqueIndex("mail_ingest_message_account_mail_uid_uq").on(
      table.accountId,
      table.mailbox,
      table.uidValidity,
      table.uid,
    ),
    index("mail_ingest_message_account_status_created_idx").on(
      table.accountId,
      table.status,
      table.createdAt,
    ),
    index("mail_ingest_message_batch_idx").on(table.batchId),
    index("mail_ingest_message_account_received_idx").on(table.accountId, table.receivedAt.desc()),
  ],
);

export const interviewConversation = pgTable(
  "interview_conversation",
  {
    agentId: text("agent_id"),
    callSuccessful: text("call_successful"),
    conversationId: text("conversation_id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    dataCollectionResults: jsonb("data_collection_results")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    dynamicVariables: jsonb("dynamic_variables")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    evaluationCriteriaResults: jsonb("evaluation_criteria_results")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    interviewRecordId: text("interview_record_id").references(() => studioInterview.id, {
      onDelete: "set null",
    }),
    keyInformation: jsonb("key_information").$type<InterviewKeyInformation>(),
    keyInformationAttempts: integer("key_information_attempts").notNull().default(0),
    keyInformationError: text("key_information_error"),
    keyInformationStartedAt: timestamp("key_information_started_at", { withTimezone: true }),
    keyInformationStatus: text("key_information_status")
      .$type<InterviewSummaryStatus>()
      .notNull()
      .default("pending"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).defaultNow().notNull(),
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
    startedAt: timestamp("started_at", { withTimezone: true }),
    status: text("status").notNull().default("initiated"),
    summaryAttempts: integer("summary_attempts").notNull().default(0),
    summaryError: text("summary_error"),
    summaryStartedAt: timestamp("summary_started_at", { withTimezone: true }),
    summaryStatus: text("summary_status")
      .$type<InterviewSummaryStatus>()
      .notNull()
      .default("pending"),
    transcript: jsonb("transcript").$type<InterviewTranscriptTurn[]>().notNull().default([]),
    transcriptSummary: text("transcript_summary"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    webhookReceivedAt: timestamp("webhook_received_at", { withTimezone: true }),
  },
  (table) => [
    index("interview_conversation_record_idx").on(table.interviewRecordId),
    index("interview_conversation_key_information_status_idx").on(table.keyInformationStatus),
    index("interview_conversation_schedule_entry_idx").on(table.scheduleEntryId),
    index("interview_conversation_status_idx").on(table.status),
    index("interview_conversation_summary_status_idx").on(table.summaryStatus),
    index("interview_conversation_updated_at_idx").on(table.updatedAt),
    index("interview_conversation_organization_idx").on(table.organizationId),
    index("interview_conversation_org_ended_started_idx").on(
      table.organizationId,
      table.endedAt,
      table.startedAt,
    ),
  ],
);

export const interviewConversationTurn = pgTable(
  "interview_conversation_turn",
  {
    conversationId: text("conversation_id")
      .notNull()
      .references(() => interviewConversation.conversationId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
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
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
    updatedAt: timestamp("updated_at", { withTimezone: true })
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
    content: jsonb("content").$type<ArcMessage>().notNull(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => chatConversation.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
    role: text("role").$type<ArcMessageRole>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    filename: text("filename").notNull(),
    id: text("id").primaryKey(),
    mediaType: text("media_type").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
    parsedAt: timestamp("parsed_at", { withTimezone: true }),
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    error: text("error"),
    feishuDocumentId: text("feishu_document_id"),
    feishuDocumentUrl: text("feishu_document_url"),
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
    sentAt: timestamp("sent_at", { withTimezone: true }),
    status: text("status").$type<AgentNotificationStatus>().notNull().default("pending"),
    type: text("type").$type<AgentNotificationType>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
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
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
    updatedAt: timestamp("updated_at", { withTimezone: true })
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
    updatedAt: timestamp("updated_at", { withTimezone: true })
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
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
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
    updatedAt: timestamp("updated_at", { withTimezone: true })
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    difficulty: text("difficulty")
      .$type<InterviewQuestionTemplateDifficulty>()
      .notNull()
      .default("easy"),
    evaluationFocus: text("evaluation_focus"),
    followUpDirections: text("follow_up_directions"),
    id: text("id").primaryKey(),
    sortOrder: integer("sort_order").notNull(),
    templateId: text("template_id")
      .notNull()
      .references(() => interviewQuestionTemplate.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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

export const interviewContextSnapshot = pgTable(
  "interview_context_snapshot",
  {
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    id: text("id").primaryKey(),
    interviewRecordId: text("interview_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<InterviewContextSnapshotPayload>().notNull(),
    reason: text("reason").$type<InterviewContextSnapshotReason>().notNull(),
    scheduleEntryId: text("schedule_entry_id").references(() => studioInterviewSchedule.id, {
      onDelete: "set null",
    }),
    status: text("status").$type<InterviewSnapshotStatus>().notNull().default("active"),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    version: integer("version").notNull(),
  },
  (table) => [
    uniqueIndex("interview_context_snapshot_record_version_uq").on(
      table.interviewRecordId,
      table.version,
    ),
    index("interview_context_snapshot_record_status_idx").on(table.interviewRecordId, table.status),
    index("interview_context_snapshot_round_idx").on(table.scheduleEntryId),
    index("interview_context_snapshot_organization_idx").on(table.organizationId),
  ],
);

export const interviewEvidenceSnapshot = pgTable(
  "interview_evidence_snapshot",
  {
    contentHash: text("content_hash").notNull(),
    contextSnapshotId: text("context_snapshot_id")
      .notNull()
      .references(() => interviewContextSnapshot.id, { onDelete: "restrict" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => interviewConversation.conversationId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    id: text("id").primaryKey(),
    interviewRecordId: text("interview_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<InterviewEvidenceSnapshotPayload>().notNull(),
    scheduleEntryId: text("schedule_entry_id").references(() => studioInterviewSchedule.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("interview_evidence_snapshot_conversation_hash_uq").on(
      table.conversationId,
      table.contentHash,
    ),
    index("interview_evidence_snapshot_record_idx").on(table.interviewRecordId),
    index("interview_evidence_snapshot_round_idx").on(table.scheduleEntryId),
    index("interview_evidence_snapshot_context_idx").on(table.contextSnapshotId),
    index("interview_evidence_snapshot_organization_idx").on(table.organizationId),
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
    activeJdSetAt: timestamp("active_jd_set_at", { withTimezone: true }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, {
        onDelete: "cascade",
      }),
    threadId: text("thread_id").primaryKey(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("feishu_thread_state_organization_idx").on(table.organizationId)],
);

export type StudioRoundEmailLogStatus = "sent" | "failed";

export const studioRoundEmailLog = pgTable(
  "studio_round_email_log",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    errorMessage: text("error_message"),
    id: text("id").primaryKey(),
    interviewRecordId: text("interview_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    resendMessageId: text("resend_message_id"),
    roundId: text("round_id")
      .notNull()
      .references(() => studioInterviewSchedule.id, { onDelete: "cascade" }),
    sentBy: text("sent_by").references(() => user.id, { onDelete: "set null" }),
    status: text("status").$type<StudioRoundEmailLogStatus>().notNull(),
    subject: text("subject").notNull(),
    templateKey: text("template_key").notNull().default("round_invite"),
    toEmail: text("to_email").notNull(),
  },
  (table) => [
    index("studio_round_email_log_organization_idx").on(table.organizationId),
    index("studio_round_email_log_round_created_idx").on(table.roundId, table.createdAt),
  ],
);

// 上下文设置（单例表，固定 id="singleton"）
// Global config (singleton table, id="singleton")
export const globalConfig = pgTable("global_config", {
  closingInstructions: text("closing_instructions").notNull().default(""),
  companyContext: text("company_context").notNull().default(""),
  companyName: text("company_name").notNull().default(""),
  id: text("id").primaryKey().default("singleton"),
  jobCodePrefix: text("job_code_prefix").notNull().default("AUR"),
  openingInstructions: text("opening_instructions").notNull().default(""),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, {
      onDelete: "cascade",
    }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});
