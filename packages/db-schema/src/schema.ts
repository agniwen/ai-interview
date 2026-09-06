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
import type {
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
} from "./interview-notifications";
import type { InterviewTranscriptTurn } from "./interview-session";
import type { JsonObject, JsonValue } from "./json";
import type {
  HumanInterviewRecordingTrack,
  RecordingIdentity,
  TranscriptAttribution,
} from "./human-interview-recording";
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
  HumanInterviewEvaluation,
  HumanInterviewEvaluationSnapshotSource,
  HumanInterviewEvaluationStatus,
  HumanInterviewFormat,
  HumanInterviewMeetingLifecycleSource,
  HumanInterviewMeetingInterviewerRole,
  HumanInterviewMeetingProvider,
  HumanInterviewMeetingStatus,
  HumanInterviewRecordingStatus,
  HumanInterviewerAssignmentStatus,
  HumanInterviewRoundOutcome,
  HumanInterviewRoundStatus,
  OfferDraftStatus,
  LegacyPipelineStage,
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
import type {
  QualitativeResumeEvaluation,
  QualitativeRecommendationLevel,
  ResumeEvaluationContractMode,
} from "./qualitative-resume-evaluation";
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
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
import type { AnyPgColumn, PgTableExtraConfigValue } from "drizzle-orm/pg-core";
import type { MeetingLiveTranscriptDraftRecord } from "./meeting-live-transcript";

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
    issuer: text("issuer").notNull(),
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
    uniqueIndex("account_issuer_account_uq").on(table.issuer, table.accountId),
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
    liveSummary: jsonb("live_summary").$type<unknown>(),
    liveTranscriptDraft: jsonb("live_transcript_draft").$type<MeetingLiveTranscriptDraftRecord>(),
    manifestSha256: text("manifest_sha256").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    processingError: text("processing_error"),
    processingRunId: text("processing_run_id"),
    purgeAfter: timestamp("purge_after", { withTimezone: true }),
    purgeClaimToken: text("purge_claim_token"),
    purgeInitialSweepCompletedAt: timestamp("purge_initial_sweep_completed_at", {
      withTimezone: true,
    }),
    purgeLeaseExpiresAt: timestamp("purge_lease_expires_at", { withTimezone: true }),
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
    trashedAt: timestamp("trashed_at", { withTimezone: true }),
    trashedFromStatus: text("trashed_from_status"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    uploadLeaseExpiresAt: timestamp("upload_lease_expires_at", { withTimezone: true }),
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
    check(
      "meeting_session_upload_lease_check",
      sql`${table.status} <> 'uploading' or ${table.uploadLeaseExpiresAt} is not null`,
    ),
    check(
      "meeting_session_trash_state_check",
      sql`(
        ${table.status} not in ('trashed', 'purging')
        and ${table.trashedAt} is null
        and ${table.trashedFromStatus} is null
        and ${table.purgeAfter} is null
        and ${table.purgeClaimToken} is null
        and ${table.purgeInitialSweepCompletedAt} is null
        and ${table.purgeLeaseExpiresAt} is null
      ) or (
        ${table.status} = 'trashed'
        and ${table.trashedAt} is not null
        and ${table.trashedFromStatus} is not null
        and ${table.purgeAfter} is not null
        and ${table.purgeClaimToken} is null
        and ${table.purgeLeaseExpiresAt} is null
      ) or (
        ${table.status} = 'purging'
        and ${table.trashedAt} is not null
        and ${table.trashedFromStatus} is not null
        and ${table.purgeAfter} is not null
      )`,
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
    index("meeting_session_upload_lease_idx").on(table.uploadLeaseExpiresAt),
    index("meeting_session_purge_due_idx").on(table.status, table.purgeAfter),
    uniqueIndex("meeting_session_id_org_uq").on(table.id, table.organizationId),
  ],
);

export const meetingLiveTranscriptLease = pgTable(
  "meeting_live_transcript_lease",
  {
    captureId: text("capture_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    track: text("track").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    check(
      "meeting_live_transcript_lease_track_check",
      sql`${table.track} in ('microphone', 'system')`,
    ),
    primaryKey({ columns: [table.organizationId, table.captureId, table.track] }),
    index("meeting_live_transcript_lease_expires_idx").on(table.expiresAt),
  ],
);

export const meetingPurgeTombstone = pgTable(
  "meeting_purge_tombstone",
  {
    manifestSha256: text("manifest_sha256").notNull(),
    meetingId: text("meeting_id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    purgedAt: timestamp("purged_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("meeting_purge_tombstone_org_purged_idx").on(table.organizationId, table.purgedAt),
  ],
);

export const meetingStorageCleanupKey = pgTable(
  "meeting_storage_cleanup_key",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    finalSweepCompletedAt: timestamp("final_sweep_completed_at", { withTimezone: true }),
    initialSweepCompletedAt: timestamp("initial_sweep_completed_at", { withTimezone: true }),
    meetingId: text("meeting_id").notNull(),
    organizationId: text("organization_id").notNull(),
    storageKey: text("storage_key").primaryKey(),
    writerLeaseExpiresAt: timestamp("writer_lease_expires_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.meetingId, table.organizationId],
      foreignColumns: [meetingSession.id, meetingSession.organizationId],
      name: "meeting_storage_cleanup_key_meeting_org_fk",
    }).onDelete("cascade"),
    index("meeting_storage_cleanup_key_meeting_idx").on(table.meetingId, table.createdAt),
  ],
);

/** @deprecated 已由 recruitingMeetingContext 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const meetingRecruitingContext = pgTable(
  "meeting_recruiting_context",
  {
    linkedAt: timestamp("linked_at", { withTimezone: true }).defaultNow().notNull(),
    linkedBy: text("linked_by"),
    meetingId: text("meeting_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
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
    fallbackProvider: text("fallback_provider"),
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull().default(1),
    selectedProvider: text("selected_provider"),
    selectionReason: text("selection_reason"),
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
    check(
      "meeting_transcription_policy_fallback_check",
      sql`${table.fallbackProvider} is null or (${table.selectedProvider} is not null and ${table.fallbackProvider} <> ${table.selectedProvider} and ${table.allowedProviders} ? ${table.fallbackProvider})`,
    ),
    check(
      "meeting_transcription_policy_reason_check",
      sql`(${table.selectedProvider} is null and ${table.selectionReason} is null) or (${table.selectedProvider} is not null and ${table.selectionReason} is not null and length(trim(${table.selectionReason})) between 10 and 500)`,
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
    remoteArtifactPurgeAttempts: integer("remote_artifact_purge_attempts").notNull().default(0),
    remoteArtifactPurgeExecutionToken: text("remote_artifact_purge_execution_token"),
    remoteArtifactPurgeStatus: text("remote_artifact_purge_status"),
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
    check(
      "meeting_processing_run_remote_purge_status_check",
      sql`${table.remoteArtifactPurgeStatus} is null or ${table.remoteArtifactPurgeStatus} in ('deleted', 'failed', 'unsupported')`,
    ),
    check(
      "meeting_processing_run_remote_purge_attempts_check",
      sql`${table.remoteArtifactPurgeAttempts} >= 0`,
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
        or (${table.kind} = 'human' and ${table.processingRunId} is null)`,
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
    attribution: jsonb("attribution").$type<TranscriptAttribution>(),
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
    uniqueIndex("meeting_intelligence_revision_id_meeting_org_uq").on(
      table.id,
      table.meetingId,
      table.organizationId,
    ),
    index("meeting_intelligence_revision_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("meeting_intelligence_revision_transcript_idx").on(table.transcriptRevisionId),
  ],
);

export const meetingQuestionThread = pgTable(
  "meeting_question_thread",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetingSession.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.meetingId, table.organizationId],
      foreignColumns: [meetingSession.id, meetingSession.organizationId],
      name: "meeting_question_thread_meeting_org_fk",
    }).onDelete("cascade"),
    uniqueIndex("meeting_question_thread_id_meeting_org_uq").on(
      table.id,
      table.meetingId,
      table.organizationId,
    ),
    uniqueIndex("meeting_question_thread_id_meeting_org_creator_uq").on(
      table.id,
      table.meetingId,
      table.organizationId,
      table.createdBy,
    ),
    index("meeting_question_thread_owner_updated_idx").on(
      table.organizationId,
      table.createdBy,
      table.updatedAt,
    ),
  ],
);

export const meetingQuestionExchange = pgTable(
  "meeting_question_exchange",
  {
    answer: jsonb("answer"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    attempt: integer("attempt").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    errorCode: text("error_code"),
    executionToken: text("execution_token"),
    id: text("id").primaryKey(),
    inputIntelligenceRevisionId: text("input_intelligence_revision_id").references(
      () => meetingIntelligenceRevision.id,
      { onDelete: "set null" },
    ),
    inputTranscriptRevisionId: text("input_transcript_revision_id")
      .notNull()
      .references(() => meetingTranscriptRevision.id, { onDelete: "restrict" }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetingSession.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    promptVersion: text("prompt_version").notNull(),
    provider: text("provider").notNull(),
    question: text("question").notNull(),
    requestId: text("request_id").notNull(),
    sequence: integer("sequence").notNull(),
    status: text("status").default("pending").notNull(),
    threadId: text("thread_id")
      .notNull()
      .references(() => meetingQuestionThread.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.threadId, table.meetingId, table.organizationId],
      foreignColumns: [
        meetingQuestionThread.id,
        meetingQuestionThread.meetingId,
        meetingQuestionThread.organizationId,
      ],
      name: "meeting_question_exchange_thread_meeting_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.threadId, table.meetingId, table.organizationId, table.createdBy],
      foreignColumns: [
        meetingQuestionThread.id,
        meetingQuestionThread.meetingId,
        meetingQuestionThread.organizationId,
        meetingQuestionThread.createdBy,
      ],
      name: "meeting_question_exchange_thread_creator_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.inputTranscriptRevisionId, table.meetingId, table.organizationId],
      foreignColumns: [
        meetingTranscriptRevision.id,
        meetingTranscriptRevision.meetingId,
        meetingTranscriptRevision.organizationId,
      ],
      name: "meeting_question_exchange_transcript_meeting_org_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.inputIntelligenceRevisionId, table.meetingId, table.organizationId],
      foreignColumns: [
        meetingIntelligenceRevision.id,
        meetingIntelligenceRevision.meetingId,
        meetingIntelligenceRevision.organizationId,
      ],
      name: "meeting_question_exchange_intelligence_meeting_org_fk",
    }),
    check("meeting_question_exchange_attempt_check", sql`${table.attempt} >= 0`),
    check("meeting_question_exchange_sequence_check", sql`${table.sequence} > 0`),
    check(
      "meeting_question_exchange_status_check",
      sql`${table.status} in ('pending', 'processing', 'ready', 'failed')`,
    ),
    check(
      "meeting_question_exchange_answer_check",
      sql`(${table.status} = 'ready') = (${table.answer} is not null)`,
    ),
    uniqueIndex("meeting_question_exchange_thread_request_uq").on(table.threadId, table.requestId),
    uniqueIndex("meeting_question_exchange_thread_sequence_uq").on(table.threadId, table.sequence),
    index("meeting_question_exchange_recovery_idx").on(table.status, table.leaseExpiresAt),
    index("meeting_question_exchange_creator_created_idx").on(
      table.organizationId,
      table.createdBy,
      table.createdAt,
    ),
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
      sql`${table.track} in ('microphone', 'system', 'candidate', 'mixed') OR ${table.track} ~ '^participant-[a-zA-Z0-9-]+$'`,
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
    recordingIdentity: jsonb("recording_identity").$type<RecordingIdentity>(),
    segments:
      jsonb("segments").$type<{ durationMs: number; offsetBytes: number; sizeBytes: number }[]>(),
    sha256: text("sha256").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    speakerDisplayName: text("speaker_display_name"),
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

export const meetingSearchProjection = pgTable(
  "meeting_search_projection",
  {
    meetingId: text("meeting_id")
      .primaryKey()
      .references(() => meetingSession.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    searchText: text("search_text").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.meetingId, table.organizationId],
      foreignColumns: [meetingSession.id, meetingSession.organizationId],
      name: "meeting_search_projection_meeting_org_fk",
    }).onDelete("cascade"),
    index("meeting_search_projection_org_idx").on(table.organizationId),
    index("meeting_search_projection_text_trgm_idx")
      .using("gin", table.searchText.asc().op("gin_trgm_ops"))
      .concurrently(),
  ],
);

export const meetingAuditLog = pgTable(
  "meeting_audit_log",
  {
    action: text("action").notNull(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    detail: jsonb("detail").$type<JsonObject>().notNull().default({}),
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
    email: text("email"),
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

/** @deprecated 已由 recruitingRecord 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
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
    // 结束元数据：分类、内部备注、对外反馈话术、录用细节、淘汰细节、previousStage。
    // 结构见 closedMetaSchema；reactivate 时读 previousStage 恢复阶段。
    // Closed-stage JSON metadata; previousStage drives reactivation restore.
    closedMeta: jsonb("closed_meta").$type<ClosedMeta | null>(),
    // ⚠️ DEPRECATED — 旧 closedReason 字段被 closedMeta.internalNotes 取代。
    // Superseded by closedMeta; kept for backwards compat.
    closedReason: text("closed_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by"),
    hrResumeAssessment: text("hr_resume_assessment"),
    hrResumeAssessmentUpdatedAt: timestamp("hr_resume_assessment_updated_at", {
      withTimezone: true,
    }),
    hrResumeAssessmentUpdatedBy: text("hr_resume_assessment_updated_by"),
    // ⚠️ DEPRECATED — 真人复面信息现在落到 studioHumanInterviewRound 子表（多轮 + 多面试官）。
    // 这两列留着兜底但应用层不再写入。
    // Superseded by studioHumanInterviewRound subtable; not written anymore.
    humanInterviewScheduledAt: timestamp("human_interview_scheduled_at", { withTimezone: true }),
    humanInterviewerId: text("human_interviewer_id"),
    id: text("id").primaryKey(),
    interviewQuestions: jsonb("interview_questions")
      .$type<InterviewQuestion[]>()
      .notNull()
      .default([]),
    // oxlint-disable-next-line no-use-before-define -- drizzle-orm resolves refs lazily at runtime
    jobDescriptionId: text("job_description_id"),
    notes: text("notes"),
    // ⚠️ DEPRECATED — Offer 信息现在落到 studioOfferDraft 子表（多版本 + 议价历史）。
    // Superseded by studioOfferDraft subtable; not written anymore.
    offerAcceptedAt: timestamp("offer_accepted_at", { withTimezone: true }),
    offerSentAt: timestamp("offer_sent_at", { withTimezone: true }),
    organizationId: text("organization_id").notNull(),
    // 新模型：候选人最终结论（默认 in_pipeline）。
    // outcome != 'in_pipeline' ⇔ pipelineStage = 'closed'（DB CHECK 强制）。
    // Verdict axis; CHECK constraint pairs non-'in_pipeline' with stage='closed'.
    outcome: text("outcome").$type<CandidateOutcome>().notNull().default("in_pipeline"),
    // 新模型：候选人所在 pipeline 阶段（默认 screening）。
    // default 让 prod 旧 INSERT 路径不传值时也能写入。
    // Stage axis; default lets pre-migration INSERTs succeed.
    pipelineStage: text("pipeline_stage")
      .$type<LegacyPipelineStage>()
      .notNull()
      .default("screening"),
    qualitativeAttemptJobDescriptionVersionId: text(
      "qualitative_attempt_job_description_version_id",
      // oxlint-disable-next-line no-use-before-define -- drizzle-orm resolves refs lazily at runtime
    ),
    qualitativeJobDescriptionVersionId: text("qualitative_job_description_version_id"),
    qualitativeRecommendationLevel: text(
      "qualitative_recommendation_level",
    ).$type<QualitativeRecommendationLevel>(),
    qualitativeResumeEvaluation: jsonb(
      "qualitative_resume_evaluation",
    ).$type<QualitativeResumeEvaluation | null>(),
    resumeContentHash: text("resume_content_hash"),
    resumeEvaluationArtifactMode: text(
      "resume_evaluation_artifact_mode",
    ).$type<ResumeEvaluationContractMode>(),
    resumeEvaluationAttemptMode: text(
      "resume_evaluation_attempt_mode",
    ).$type<ResumeEvaluationContractMode>(),
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
    resumeScreeningResult: jsonb("resume_screening_result").$type<JsonObject | null>(),
    resumeScreeningStatus: text("resume_screening_status")
      .$type<ResumeScreeningStatus>()
      .notNull()
      .default("idle"),
    // 简历进入招聘台的来源。直传 / 我的简历池 / 公共简历池 / 聊天入库 / API 入库。
    // Source metadata for resume-library rows; keeps the existing workflow
    // intact while preserving provenance for pool imports.
    resumeSourceImportedAt: timestamp("resume_source_imported_at", { withTimezone: true }),
    resumeSourceImportedBy: text("resume_source_imported_by"),
    // oxlint-disable-next-line no-use-before-define -- drizzle-orm resolves refs lazily at runtime
    resumeSourcePoolItemId: text("resume_source_pool_item_id"),
    resumeSourceType: text("resume_source_type").$type<StudioInterviewResumeSourceType>(),
    resumeStorageKey: text("resume_storage_key"),
    resumeText: text("resume_text"),
    // Database-maintained keyword projection. NULL means historical backfill is pending.
    searchCjkBigrams: text("search_cjk_bigrams").array(),
    searchText: text("search_text"),
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
    // Created concurrently by the resume-search maintenance script after backfill.
    index("studio_interview_search_text_trgm_idx").using(
      "gin",
      table.searchText.asc().op("gin_trgm_ops"),
    ),
    index("studio_interview_search_cjk_bigrams_idx").using("gin", table.searchCjkBigrams),
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
      sql`${table.resumeEvaluationArtifactMode} IS NULL OR ${table.resumeEvaluationArtifactMode} IN ('legacy', 'structured', 'qualitative')`,
    ),
    check(
      "studio_interview_resume_evaluation_attempt_mode_check",
      sql`${table.resumeEvaluationAttemptMode} IS NULL OR ${table.resumeEvaluationAttemptMode} IN ('legacy', 'structured', 'qualitative')`,
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
    check(
      "studio_interview_qualitative_evaluation_complete_check",
      sql`(
        ${table.qualitativeResumeEvaluation} IS NULL
        AND ${table.qualitativeRecommendationLevel} IS NULL
        AND ${table.qualitativeJobDescriptionVersionId} IS NULL
      ) OR (
        ${table.qualitativeResumeEvaluation} IS NOT NULL
        AND ${table.qualitativeRecommendationLevel} IN ('not_recommended', 'undecided', 'recommended', 'highly_recommended')
        AND ${table.qualitativeJobDescriptionVersionId} IS NOT NULL
      )`,
    ),
    index("studio_interview_qualitative_job_order_idx").on(
      table.organizationId,
      table.jobDescriptionId,
      table.qualitativeRecommendationLevel,
      table.resumeReviewGeneratedAt.desc(),
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
    resumeScreeningPolicy: jsonb("resume_screening_policy").$type<JsonObject | null>(),
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
      sql`${table.evaluationMode} IN ('legacy', 'structured', 'qualitative')`,
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
      ) OR (
        ${table.evaluationMode} = 'qualitative'
        AND ${table.lifecycleStatus} = 'published'
        AND ${table.publishedAt} IS NOT NULL
      )`,
    ),
  ],
);

export const jobDescriptionVersion = pgTable(
  "job_description_version",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    id: text("id").primaryKey(),
    jobDescriptionId: text("job_description_id").references(() => jobDescription.id, {
      onDelete: "set null",
    }),
    jobDescriptionName: text("job_description_name").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [
    index("job_description_version_job_idx").on(table.jobDescriptionId, table.version),
    index("job_description_version_org_idx").on(table.organizationId),
    uniqueIndex("job_description_version_job_version_uq")
      .on(table.jobDescriptionId, table.version)
      .where(sql`${table.jobDescriptionId} IS NOT NULL`),
  ],
);

/** @deprecated 已由 recruitingResumeEvaluation 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const resumeEvaluationVersion = pgTable(
  "resume_evaluation_version",
  {
    artifact: jsonb("artifact").$type<JsonValue>().notNull(),
    contractVersion: text("contract_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    id: text("id").primaryKey(),
    jobDescriptionVersionId: text("job_description_version_id"),
    numericScore: integer("numeric_score"),
    organizationId: text("organization_id").notNull(),
    recommendationLevel: text("recommendation_level").$type<QualitativeRecommendationLevel>(),
    resumeRecordId: text("resume_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    runId: text("run_id"),
  },
  (table) => [
    index("resume_evaluation_version_record_created_idx").on(
      table.resumeRecordId,
      table.createdAt.desc(),
    ),
    index("resume_evaluation_version_org_idx").on(table.organizationId),
    uniqueIndex("resume_evaluation_version_record_contract_run_uq")
      .on(table.resumeRecordId, table.contractVersion, table.runId)
      .where(sql`${table.runId} IS NOT NULL`),
    check(
      "resume_evaluation_version_numeric_score_check",
      sql`${table.numericScore} IS NULL OR ${table.numericScore} BETWEEN 0 AND 100`,
    ),
    check(
      "resume_evaluation_version_recommendation_check",
      sql`${table.recommendationLevel} IS NULL OR ${table.recommendationLevel} IN ('not_recommended', 'undecided', 'recommended', 'highly_recommended')`,
    ),
  ],
);

/** @deprecated 已由 recruitingResumeEvaluation 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const resumeEvaluationFailure = pgTable(
  "resume_evaluation_failure",
  {
    contractVersion: text("contract_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    errorMessage: text("error_message").notNull(),
    id: text("id").primaryKey(),
    jobDescriptionVersionId: text("job_description_version_id"),
    organizationId: text("organization_id").notNull(),
    resumeRecordId: text("resume_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    runId: text("run_id").notNull(),
  },
  (table) => [
    index("resume_evaluation_failure_record_created_idx").on(
      table.resumeRecordId,
      table.createdAt.desc(),
    ),
    index("resume_evaluation_failure_org_idx").on(table.organizationId),
    uniqueIndex("resume_evaluation_failure_record_contract_run_uq").on(
      table.resumeRecordId,
      table.contractVersion,
      table.runId,
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
    legacySnapshot: jsonb("legacy_snapshot").$type<JsonObject>().notNull(),
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

/** @deprecated 已由 aiInterviewRound 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const studioInterviewSchedule = pgTable(
  "studio_interview_schedule",
  {
    allowTextInput: boolean("allow_text_input").notNull().default(false),
    candidateDeclineReason: text("candidate_decline_reason"),
    candidateFeedbackCategories: jsonb("candidate_feedback_categories").$type<
      CandidateInterviewFeedbackCategory[] | null
    >(),
    candidateFeedbackDetail: text("candidate_feedback_detail"),
    candidateFeedbackSubmittedAt: timestamp("candidate_feedback_submitted_at", {
      withTimezone: true,
    }),
    candidateInviteExpiresAt: timestamp("candidate_invite_expires_at", { withTimezone: true }),
    candidateInviteStatus: text("candidate_invite_status")
      .$type<CandidateInterviewInvitationStatus>()
      .notNull()
      .default("pending"),
    candidateInviteTokenHash: text("candidate_invite_token_hash"),
    candidateRespondedAt: timestamp("candidate_responded_at", { withTimezone: true }),
    conversationId: text("conversation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by"),
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
    invitationVersion: integer("invitation_version").notNull().default(1),
    liveKitParticipantIdentity: text("livekit_participant_identity"),
    liveKitRoomName: text("livekit_room_name"),
    notes: text("notes"),
    organizationId: text("organization_id").notNull(),
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
    uniqueIndex("studio_interview_schedule_invite_token_uq")
      .on(table.candidateInviteTokenHash)
      .where(sql`${table.candidateInviteTokenHash} IS NOT NULL`),
    check(
      "studio_interview_schedule_invite_status_check",
      sql`${table.candidateInviteStatus} IN ('pending', 'sent', 'accepted', 'declined', 'expired')`,
    ),
    check(
      "studio_interview_schedule_invitation_version_check",
      sql`${table.invitationVersion} > 0`,
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
/** @deprecated 已由 humanInterviewRound 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const studioHumanInterviewRound = pgTable(
  "studio_human_interview_round",
  {
    cancelReason: text("cancel_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    evaluation: jsonb("evaluation").$type<HumanInterviewEvaluation>(),
    evaluationError: text("evaluation_error"),
    evaluationStatus: text("evaluation_status")
      .$type<HumanInterviewEvaluationStatus>()
      .notNull()
      .default("not_started"),
    evaluationSubmittedAt: timestamp("evaluation_submitted_at", { withTimezone: true }),
    evaluationTranscriptRevisionId: text("evaluation_transcript_revision_id"),
    evaluationUpdatedAt: timestamp("evaluation_updated_at", { withTimezone: true }),
    evaluationUpdatedBy: text("evaluation_updated_by"),
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
    organizationId: text("organization_id").notNull(),
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
    index("studio_human_interview_round_evaluation_status_idx").on(table.evaluationStatus),
    check(
      "studio_human_interview_round_evaluation_status_check",
      sql`${table.evaluationStatus} in ('not_started', 'generating', 'draft', 'submitted', 'failed')`,
    ),
  ],
);

// AI 生成结果与面试官最终提交结果的不可变快照，用于后续评价效果分析。
// 当前业务状态仍由 studioHumanInterviewRound.evaluation 承载并直接覆盖。
/** @deprecated 已由 humanInterviewEvaluationSnapshot 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const studioHumanInterviewEvaluationSnapshot = pgTable(
  "studio_human_interview_evaluation_snapshot",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by"),
    evaluation: jsonb("evaluation").$type<HumanInterviewEvaluation>().notNull(),
    id: text("id").primaryKey(),
    meetingSessionId: text("meeting_session_id"),
    organizationId: text("organization_id").notNull(),
    outcome: text("outcome").$type<HumanInterviewRoundOutcome>(),
    roundId: text("round_id")
      .notNull()
      .references(() => studioHumanInterviewRound.id, { onDelete: "cascade" }),
    source: text("source").$type<HumanInterviewEvaluationSnapshotSource>().notNull(),
    transcriptRevisionId: text("transcript_revision_id"),
  },
  (table) => [
    index("studio_human_interview_evaluation_snapshot_round_created_idx").on(
      table.roundId,
      table.createdAt,
    ),
    index("studio_human_interview_evaluation_snapshot_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    check(
      "studio_human_interview_evaluation_snapshot_source_check",
      sql`${table.source} in ('ai_generated', 'human_submitted')`,
    ),
  ],
);

// Transactional outbox for confirmed human evaluations, independent of message delivery.
/** @deprecated 已由 humanInterviewEvaluationDocumentSync 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const humanInterviewDocumentSync = pgTable(
  "human_interview_document_sync",
  {
    attemptCount: integer("attempt_count").notNull().default(0),
    blockId: text("block_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    documentId: text("document_id"),
    documentUrl: text("document_url"),
    error: text("error"),
    leaseOwner: text("lease_owner"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    organizationId: text("organization_id").notNull(),
    providerId: text("provider_id"),
    roundId: text("round_id")
      .notNull()
      .unique()
      .references(() => studioHumanInterviewRound.id, { onDelete: "cascade" }),
    snapshotId: text("snapshot_id")
      .primaryKey()
      .references(() => studioHumanInterviewEvaluationSnapshot.id, { onDelete: "cascade" }),
    status: text("status")
      .$type<"pending" | "syncing" | "waiting_document" | "failed" | "synced">()
      .notNull()
      .default("pending"),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
  },
  (table) => [
    index("human_interview_document_sync_due_idx").on(table.status, table.nextAttemptAt),
    check(
      "human_interview_document_sync_status_check",
      sql`${table.status} in ('pending', 'syncing', 'waiting_document', 'failed', 'synced')`,
    ),
  ],
);

// 真人复面会议：一场会议对应一个 LiveKit room、一个候选人 round 和多个面试官。
// 评价结果仍然写在 studioHumanInterviewRound；这里保存会议级生命周期和录音处理状态。
//
// Human-interview meeting. One meeting maps to one LiveKit room, one candidate
// round, and multiple interviewers. Per-round verdicts remain on
// studioHumanInterviewRound.
/** @deprecated 已由 humanInterviewMeeting 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const studioHumanInterviewMeeting = pgTable(
  "studio_human_interview_meeting",
  {
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    candidateRecordingDurationMs: integer("candidate_recording_duration_ms"),
    candidateRecordingEgressId: text("candidate_recording_egress_id"),
    candidateRecordingError: text("candidate_recording_error"),
    candidateRecordingFileKey: text("candidate_recording_file_key"),
    candidateRecordingSizeBytes: integer("candidate_recording_size_bytes"),
    candidateRecordingStatus: text("candidate_recording_status")
      .$type<HumanInterviewRecordingStatus>()
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by"),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    feishuAppLink: text("feishu_app_link"),
    feishuAttendeeOpenIds: jsonb("feishu_attendee_open_ids").$type<string[]>(),
    feishuCalendarEventId: text("feishu_calendar_event_id"),
    feishuCalendarEventUrl: text("feishu_calendar_event_url"),
    feishuCalendarId: text("feishu_calendar_id"),
    feishuLastError: text("feishu_last_error"),
    feishuMeetingId: text("feishu_meeting_id"),
    feishuMeetingNo: text("feishu_meeting_no"),
    feishuMeetingUrl: text("feishu_meeting_url"),
    feishuOwnerOpenId: text("feishu_owner_open_id"),
    feishuProviderId: text("feishu_provider_id").$type<FeishuHumanInterviewProviderId>(),
    feishuReserveId: text("feishu_reserve_id"),
    feishuSyncStatus: text("feishu_sync_status").$type<FeishuHumanInterviewSyncStatus>(),
    feishuSyncedAt: timestamp("feishu_synced_at", { withTimezone: true }),
    id: text("id").primaryKey(),
    lifecycleOccurredAt: timestamp("lifecycle_occurred_at", { withTimezone: true }),
    lifecycleSource: text("lifecycle_source").$type<HumanInterviewMeetingLifecycleSource>(),
    liveKitRoomName: text("livekit_room_name"),
    notes: text("notes"),
    organizationId: text("organization_id").notNull(),
    processingMeetingSessionId: text("processing_meeting_session_id").unique(),
    recordingDurationMs: integer("recording_duration_ms"),
    recordingEgressId: text("recording_egress_id"),
    recordingError: text("recording_error"),
    recordingFileKey: text("recording_file_key"),
    recordingSizeBytes: integer("recording_size_bytes"),
    recordingStatus: text("recording_status")
      .$type<HumanInterviewRecordingStatus>()
      .notNull()
      .default("pending"),
    recordingTracks: jsonb("recording_tracks").$type<HumanInterviewRecordingTrack[]>(),
    scheduleVersion: integer("schedule_version").notNull().default(1),
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
    index("studio_human_interview_meeting_recording_status_idx").on(
      table.organizationId,
      table.recordingStatus,
    ),
    uniqueIndex("studio_human_interview_meeting_id_org_uq").on(table.id, table.organizationId),
    uniqueIndex("studio_human_interview_meeting_livekit_room_idx").on(table.liveKitRoomName),
    index("studio_human_interview_meeting_feishu_meeting_idx").on(
      table.feishuProviderId,
      table.feishuMeetingId,
    ),
    check(
      "studio_human_interview_meeting_schedule_version_check",
      sql`${table.scheduleVersion} > 0`,
    ),
    check(
      "studio_human_interview_meeting_recording_status_check",
      sql`${table.recordingStatus} in ('pending', 'starting', 'active', 'completed', 'failed')`,
    ),
    check(
      "studio_human_interview_meeting_candidate_recording_status_check",
      sql`${table.candidateRecordingStatus} in ('pending', 'starting', 'active', 'completed', 'failed')`,
    ),
  ],
);

// Provider webhook deliveries are at-least-once. Keep a compact receipt so a
// duplicate or delayed delivery cannot regress the persisted lifecycle.
/** @deprecated 已由 humanInterviewMeetingEvent 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const studioHumanInterviewMeetingEvent = pgTable(
  "studio_human_interview_meeting_event",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => studioHumanInterviewMeeting.id, { onDelete: "cascade" }),
    provider: text("provider").$type<HumanInterviewMeetingProvider>().notNull(),
    providerEventId: text("provider_event_id").notNull(),
    type: text("type").notNull(),
  },
  (table) => [
    index("studio_human_interview_meeting_event_meeting_idx").on(table.meetingId),
    uniqueIndex("studio_human_interview_meeting_event_provider_event_idx").on(
      table.provider,
      table.providerEventId,
    ),
  ],
);

// 会议 ↔ 候选人轮次 junction。每个 round 仍然指向 studio_interview 简历/候选人记录；
// 这里承载候选人参加同一场会议的邀请和入离会时间。
//
// Meeting ↔ candidate-round junction. The round itself links back to the resume
// record; this table stores candidate-specific invite/join metadata for the meeting.
/** @deprecated 已由 humanInterviewMeetingRound 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const studioHumanInterviewMeetingRound = pgTable(
  "studio_human_interview_meeting_round",
  {
    candidateDeclineReason: text("candidate_decline_reason"),
    candidateInviteExpiresAt: timestamp("candidate_invite_expires_at", { withTimezone: true }),
    candidateInviteStatus: text("candidate_invite_status")
      .$type<CandidateInterviewInvitationStatus>()
      .notNull()
      .default("pending"),
    candidateInviteTokenHash: text("candidate_invite_token_hash"),
    candidateRespondedAt: timestamp("candidate_responded_at", { withTimezone: true }),
    invitationVersion: integer("invitation_version").notNull().default(1),
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
    check(
      "studio_human_interview_meeting_round_invite_status_check",
      sql`${table.candidateInviteStatus} IN ('pending', 'sent', 'accepted', 'declined', 'expired')`,
    ),
    check(
      "studio_human_interview_meeting_round_invitation_version_check",
      sql`${table.invitationVersion} > 0`,
    ),
  ],
);

// 会议 ↔ 面试官 junction。保留 role 以支持主持人/旁听者等会议级权限。
// Meeting ↔ interviewer junction. role leaves room for host/observer permissions.
/** @deprecated 已由 humanInterviewMeetingInterviewer 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const studioHumanInterviewMeetingInterviewer = pgTable(
  "studio_human_interview_meeting_interviewer",
  {
    feishuOpenId: text("feishu_open_id"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
    liveTranscriptDraft: jsonb("live_transcript_draft").$type<MeetingLiveTranscriptDraftRecord>(),
    liveTranscriptDraftVersion: integer("live_transcript_draft_version").notNull().default(0),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => studioHumanInterviewMeeting.id, { onDelete: "cascade" }),
    role: text("role")
      .$type<HumanInterviewMeetingInterviewerRole>()
      .notNull()
      .default("interviewer"),
    userId: text("user_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.meetingId, table.userId] }),
    index("studio_human_interview_meeting_interviewer_user_idx").on(table.userId),
    check(
      "studio_human_interview_meeting_interviewer_draft_version_check",
      sql`${table.liveTranscriptDraftVersion} >= 0`,
    ),
  ],
);

// 真人复面面试官 junction：(roundId, userId) 复合 PK；删用户级联，删轮次级联。
// 单独索引 userId 让「查询某面试官面过的所有候选人」走索引。
// Junction for (round, interviewer) many-to-many. userId index supports the
// "all rounds interviewed by user X" query.
/** @deprecated 已由 humanInterviewRoundInterviewer 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const studioHumanInterviewRoundInterviewer = pgTable(
  "studio_human_interview_round_interviewer",
  {
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedScheduleVersion: integer("confirmed_schedule_version"),
    declineReason: text("decline_reason"),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    roundId: text("round_id")
      .notNull()
      .references(() => studioHumanInterviewRound.id, { onDelete: "cascade" }),
    status: text("status").$type<HumanInterviewerAssignmentStatus>().notNull().default("pending"),
    userId: text("user_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roundId, table.userId] }),
    index("studio_human_interview_round_interviewer_user_idx").on(table.userId),
    check(
      "studio_human_interview_round_interviewer_status_check",
      sql`${table.status} IN ('pending', 'confirmed', 'declined')`,
    ),
    check(
      "studio_human_interview_round_interviewer_confirmed_version_check",
      sql`${table.confirmedScheduleVersion} IS NULL OR ${table.confirmedScheduleVersion} > 0`,
    ),
  ],
);

// Offer 草稿（多版本）。version 在同一候选人内单调递增；新版本发出时旧版置 superseded。
// status 状态机：draft → sent → (accepted/declined/expired)；任意态都可被 superseded。
// 候选人议价记在 candidateCounter（自由文本，描述本版回复内容）。
//
// Versioned offer drafts. Version is monotonically increasing per candidate;
// new versions supersede earlier ones. Status: draft → sent → terminal.
// Candidate counter-offers recorded as free text on the draft they respond to.
/** @deprecated 已由 recruitingOffer 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
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
    organizationId: text("organization_id").notNull(),
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
  // oxlint-disable-next-line sort-keys -- columns stay grouped by the resume-pool domain lifecycle.
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
    qualitativeJobDescriptionVersionId: text("qualitative_job_description_version_id").references(
      () => jobDescriptionVersion.id,
      { onDelete: "set null" },
    ),
    qualitativeRecommendationLevel: text(
      "qualitative_recommendation_level",
    ).$type<QualitativeRecommendationLevel>(),
    qualitativeResumeEvaluation: jsonb(
      "qualitative_resume_evaluation",
    ).$type<QualitativeResumeEvaluation | null>(),
    qualitativeResumeSummary: text("qualitative_resume_summary"),
    notes: text("notes"),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: text("published_by").references(() => user.id, { onDelete: "set null" }),
    resumeContentHash: text("resume_content_hash"),
    resumeEvaluationContractVersion: text("resume_evaluation_contract_version"),
    resumeEvaluationGeneratedAt: timestamp("resume_evaluation_generated_at", {
      withTimezone: true,
    }),
    resumeEvaluationInputHash: text("resume_evaluation_input_hash"),
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
    // Database-maintained keyword projection. NULL means historical backfill is pending.
    searchCjkBigrams: text("search_cjk_bigrams").array(),
    searchText: text("search_text"),
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
    // Created concurrently by the resume-search maintenance script after backfill.
    index("resume_pool_item_search_text_trgm_idx").using(
      "gin",
      table.searchText.asc().op("gin_trgm_ops"),
    ),
    index("resume_pool_item_search_cjk_bigrams_idx").using("gin", table.searchCjkBigrams),
    index("resume_pool_item_org_user_scope_created_idx").on(
      table.organizationId,
      table.createdBy,
      table.scope,
      table.createdAt,
    ),
    index("resume_pool_item_resume_content_hash_idx").on(table.resumeContentHash),
    index("resume_pool_item_resume_parse_status_idx").on(table.resumeParseStatus),
    index("resume_pool_item_qualitative_job_order_idx").on(
      table.organizationId,
      table.jobDescriptionId,
      table.qualitativeRecommendationLevel,
      table.resumeEvaluationGeneratedAt,
    ),
    check(
      "resume_pool_item_qualitative_evaluation_complete_check",
      sql`(
        ${table.qualitativeResumeEvaluation} IS NULL
        AND ${table.qualitativeRecommendationLevel} IS NULL
        AND ${table.qualitativeResumeSummary} IS NULL
        AND ${table.qualitativeJobDescriptionVersionId} IS NULL
        AND ${table.resumeEvaluationContractVersion} IS NULL
        AND ${table.resumeEvaluationGeneratedAt} IS NULL
        AND ${table.resumeEvaluationInputHash} IS NULL
      ) OR (
        ${table.qualitativeResumeEvaluation} IS NOT NULL
        AND ${table.qualitativeRecommendationLevel} IN ('not_recommended', 'undecided', 'recommended', 'highly_recommended')
        AND ${table.qualitativeResumeSummary} IS NOT NULL
        AND ${table.qualitativeJobDescriptionVersionId} IS NOT NULL
        AND ${table.resumeEvaluationContractVersion} = 'qualitative-v2'
        AND ${table.resumeEvaluationGeneratedAt} IS NOT NULL
        AND ${table.resumeEvaluationInputHash} IS NOT NULL
      )`,
    ),
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

/** @deprecated 已由 recruitingPoolImport 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const resumePoolImport = pgTable(
  "resume_pool_import",
  {
    id: text("id").primaryKey(),
    importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
    importedBy: text("imported_by"),
    importedResumeRecordId: text("imported_resume_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    poolItemId: text("pool_item_id").notNull(),
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
    payload: jsonb("payload").$type<JsonObject | null>(),
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

/** @deprecated 已由 recruitingUploadBatch 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const resumeUploadBatch = pgTable(
  "resume_upload_batch",
  {
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").notNull(),
    dedupPolicy: text("dedup_policy").$type<ResumeUploadBatchDedupPolicy>().notNull(),
    failedCount: integer("failed_count").notNull().default(0),
    id: text("id").primaryKey(),
    jdMode: text("jd_mode").$type<ResumeUploadBatchJdMode>().notNull(),
    // oxlint-disable-next-line no-use-before-define
    jobDescriptionId: text("job_description_id"),
    // Only newly-created mail batches opt into automatic job binding.
    // Existing batches stay null and are never matched retroactively.
    jobMatchRequestedAt: timestamp("job_match_requested_at", { withTimezone: true }),
    organizationId: text("organization_id").notNull(),
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

/** @deprecated 已由 recruitingUploadBatchItem 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
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
    poolItemId: text("pool_item_id"),
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

export type ResumeJobMatchRunStatus =
  | "processing"
  | "succeeded"
  | "failed"
  | "no_candidates"
  | "superseded";
export type ResumeJobMatchSelectionMethod =
  | "mail_subject_code_exact"
  | "account_fixed"
  | "filename_exact"
  | "ai_rerank"
  | "strong_signal_fallback"
  | "vector_fallback"
  | "ai_full_list";
export type ResumeJobMatchRecallSource =
  | "subject_code"
  | "account_fixed"
  | "target_role"
  | "target_role_exact"
  | "target_role_core"
  | "filename"
  | "vector"
  | "ai_full_list";

export interface ResumeJobMatchJobSnapshot {
  code: string | null;
  contentHash: string;
  departmentName: string | null;
  id: string;
  name: string;
}

export type ResumeSemanticSourceType = "resume_pool_item" | "studio_interview" | "job_description";
export type ResumeSemanticIndexStatus =
  | "deleted"
  | "failed"
  | "indexed"
  | "pending"
  | "skipped"
  | "stale";
export type ResumeSemanticDuplicateLevel = "high" | "low" | "medium";
export type ResumeDuplicateMatchStatus = "active" | "confirmed" | "dismissed";

/** @deprecated 已由 recruitingSearchIndex 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
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
    organizationId: text("organization_id").notNull(),
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

/** @deprecated 已由 recruitingDuplicateMatch 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const resumeDuplicateMatch = pgTable(
  "resume_duplicate_match",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    embeddingVersion: text("embedding_version").notNull(),
    id: text("id").primaryKey(),
    level: text("level").$type<ResumeSemanticDuplicateLevel>().notNull(),
    matchedSourceId: text("matched_source_id").notNull(),
    matchedSourceType: text("matched_source_type").$type<ResumeSemanticSourceType>().notNull(),
    organizationId: text("organization_id").notNull(),
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
    jdMode: text("jd_mode").$type<ResumeUploadBatchJdMode>().notNull().default("auto"),
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

/** @deprecated 已由 recruitingMailMessage 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const mailIngestMessage = pgTable(
  "mail_ingest_message",
  {
    accountId: text("account_id").notNull(),
    attachmentCount: integer("attachment_count"),
    batchId: text("batch_id").references(() => resumeUploadBatch.id, { onDelete: "set null" }),
    boundJobDescriptionId: text("bound_job_description_id"),
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

/** @deprecated 已由 recruitingJobMatchRun 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const resumeJobMatchRun = pgTable(
  "resume_job_match_run",
  {
    batchItemId: text("batch_item_id").references(() => resumeUploadBatchItem.id, {
      onDelete: "set null",
    }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    errorMessage: text("error_message"),
    id: text("id").primaryKey(),
    mailMessageId: text("mail_message_id").references(() => mailIngestMessage.id, {
      onDelete: "set null",
    }),
    matcherVersion: text("matcher_version").notNull(),
    model: text("model"),
    organizationId: text("organization_id").notNull(),
    poolItemId: text("pool_item_id").notNull(),
    promptVersion: text("prompt_version"),
    resumeInputHash: text("resume_input_hash").notNull(),
    selectedJobDescriptionId: text("selected_job_description_id"),
    selectionMethod: text("selection_method").$type<ResumeJobMatchSelectionMethod>(),
    status: text("status").$type<ResumeJobMatchRunStatus>().notNull(),
  },
  (table) => [
    uniqueIndex("resume_job_match_run_pool_batch_version_uq").on(
      table.poolItemId,
      table.batchItemId,
      table.matcherVersion,
    ),
    index("resume_job_match_run_org_pool_created_idx").on(
      table.organizationId,
      table.poolItemId,
      table.createdAt,
    ),
    index("resume_job_match_run_selected_job_idx").on(table.selectedJobDescriptionId),
  ],
);

/** @deprecated 已由 recruitingJobMatchCandidate 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const resumeJobMatchCandidate = pgTable(
  "resume_job_match_candidate",
  {
    aiRank: integer("ai_rank"),
    aiReason: text("ai_reason"),
    aiScore: integer("ai_score"),
    id: text("id").primaryKey(),
    jobDescriptionId: text("job_description_id"),
    jobSnapshot: jsonb("job_snapshot").$type<ResumeJobMatchJobSnapshot>().notNull(),
    overviewScore: doublePrecision("overview_score"),
    recallRank: integer("recall_rank"),
    recallSource: text("recall_source").$type<ResumeJobMatchRecallSource>().notNull(),
    runId: text("run_id")
      .notNull()
      .references(() => resumeJobMatchRun.id, { onDelete: "cascade" }),
    skillRoleScore: doublePrecision("skill_role_score"),
    vectorScore: integer("vector_score"),
    workProjectScore: doublePrecision("work_project_score"),
  },
  (table) => [
    uniqueIndex("resume_job_match_candidate_run_job_uq").on(table.runId, table.jobDescriptionId),
    uniqueIndex("resume_job_match_candidate_run_ai_rank_uq").on(table.runId, table.aiRank),
    index("resume_job_match_candidate_job_idx").on(table.jobDescriptionId),
    check(
      "resume_job_match_candidate_ai_score_check",
      sql`${table.aiScore} IS NULL OR (${table.aiScore} >= 0 AND ${table.aiScore} <= 100)`,
    ),
    check(
      "resume_job_match_candidate_ai_rank_check",
      sql`${table.aiRank} IS NULL OR ${table.aiRank} > 0`,
    ),
    check(
      "resume_job_match_candidate_recall_rank_check",
      sql`${table.recallRank} IS NULL OR ${table.recallRank} > 0`,
    ),
  ],
);

/** @deprecated 已由 aiInterviewConversation 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const interviewConversation = pgTable(
  "interview_conversation",
  {
    agentId: text("agent_id"),
    callSuccessful: text("call_successful"),
    conversationId: text("conversation_id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    dataCollectionResults: jsonb("data_collection_results")
      .$type<JsonObject>()
      .notNull()
      .default({}),
    dynamicVariables: jsonb("dynamic_variables").$type<JsonObject>().notNull().default({}),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    evaluationCriteriaResults: jsonb("evaluation_criteria_results")
      .$type<JsonObject>()
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
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default({}),
    metrics: jsonb("metrics").$type<JsonObject>().notNull().default({}),
    mode: text("mode"),
    organizationId: text("organization_id").notNull(),
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

/** @deprecated 已由 aiInterviewConversationTurn 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
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
    organizationId: text("organization_id").notNull(),
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

/** @deprecated 已由 recruitingEvent 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const interviewAuditLog = pgTable(
  "interview_audit_log",
  {
    action: text("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    detail: jsonb("detail").$type<JsonObject>().notNull().default({}),
    id: text("id").primaryKey(),
    interviewRecordId: text("interview_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    operatorId: text("operator_id"),
    organizationId: text("organization_id").notNull(),
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

/** @deprecated 已由 recruitingNotificationRecipient 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const studioInterviewNotificationRecipient = pgTable(
  "studio_interview_notification_recipient",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by"),
    interviewRecordId: text("interview_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    userId: text("user_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.interviewRecordId, table.userId] }),
    foreignKey({
      columns: [table.interviewRecordId, table.organizationId],
      foreignColumns: [studioInterview.id, studioInterview.organizationId],
      name: "studio_interview_notification_recipient_record_org_fk",
    }).onDelete("cascade"),

    index("studio_interview_notification_recipient_user_idx").on(
      table.organizationId,
      table.userId,
    ),
  ],
);

export const interviewNotificationTemplate = pgTable(
  "interview_notification_template",
  {
    activeVersionId: text("active_version_id").references(
      // oxlint-disable-next-line no-use-before-define -- Drizzle resolves this circular FK lazily.
      (): AnyPgColumn => interviewNotificationTemplateVersion.id,
      { onDelete: "set null" },
    ),
    audienceType: text("audience_type").$type<InterviewNotificationAudienceType>().notNull(),
    channel: text("channel").$type<InterviewNotificationChannel>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    eventType: text("event_type").$type<InterviewNotificationEventType>().notNull(),
    id: text("id").primaryKey(),
    locale: text("locale").default("zh-CN").notNull(),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("interview_notification_template_workspace_uq")
      .on(table.organizationId, table.eventType, table.audienceType, table.channel, table.locale)
      .where(sql`${table.organizationId} IS NOT NULL`),
    uniqueIndex("interview_notification_template_system_uq")
      .on(table.eventType, table.audienceType, table.channel, table.locale)
      .where(sql`${table.organizationId} IS NULL`),
    index("interview_notification_template_org_enabled_idx").on(
      table.organizationId,
      table.enabled,
    ),
    check(
      "interview_notification_template_audience_check",
      sql`${table.audienceType} IN ('candidate', 'selected_hr_user', 'initiator_fallback', 'meeting_interviewer')`,
    ),
    check(
      "interview_notification_template_channel_check",
      sql`${table.channel} IN ('feishu', 'email', 'sms')`,
    ),
  ],
);

export const interviewNotificationTemplateVersion = pgTable(
  "interview_notification_template_version",
  {
    contentTemplate: text("content_template").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    id: text("id").primaryKey(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    status: text("status").$type<InterviewNotificationTemplateStatus>().notNull().default("draft"),
    subjectTemplate: text("subject_template"),
    templateId: text("template_id")
      .notNull()
      .references(() => interviewNotificationTemplate.id, { onDelete: "cascade" }),
    variables: jsonb("variables")
      .$type<InterviewNotificationTemplateVariable[]>()
      .notNull()
      .default([]),
    version: integer("version").notNull(),
  },
  (table) => [
    uniqueIndex("interview_notification_template_version_uq").on(table.templateId, table.version),
    index("interview_notification_template_version_status_idx").on(table.templateId, table.status),
    check(
      "interview_notification_template_version_status_check",
      sql`${table.status} IN ('draft', 'published', 'archived')`,
    ),
    check("interview_notification_template_version_positive_check", sql`${table.version} > 0`),
  ],
);

/** @deprecated 已由 recruitingNotificationEvent 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const interviewNotificationEvent = pgTable(
  "interview_notification_event",
  {
    actorUserId: text("actor_user_id"),
    attemptCount: integer("attempt_count").default(0).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    conversationId: text("conversation_id").references(() => interviewConversation.conversationId, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    humanMeetingId: text("human_meeting_id").references(() => studioHumanInterviewMeeting.id, {
      onDelete: "cascade",
    }),
    humanRoundId: text("human_round_id").references(() => studioHumanInterviewRound.id, {
      onDelete: "cascade",
    }),
    id: text("id").primaryKey(),
    interviewRecordId: text("interview_record_id").references(() => studioInterview.id, {
      onDelete: "cascade",
    }),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    leaseOwner: text("lease_owner"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    organizationId: text("organization_id").notNull(),
    payloadSnapshot: jsonb("payload_snapshot")
      .$type<InterviewNotificationPayloadSnapshot>()
      .notNull(),
    scheduleEntryId: text("schedule_entry_id").references(() => studioInterviewSchedule.id, {
      onDelete: "cascade",
    }),
    scopeType: text("scope_type").$type<InterviewNotificationScopeType>().notNull(),
    status: text("status").$type<InterviewNotificationEventStatus>().notNull().default("pending"),
    type: text("type").$type<InterviewNotificationEventType>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("interview_notification_event_dedupe_uq").on(table.dedupeKey),
    index("interview_notification_event_claim_idx").on(
      table.status,
      table.nextAttemptAt,
      table.availableAt,
    ),
    index("interview_notification_event_org_created_idx").on(table.organizationId, table.createdAt),
    index("interview_notification_event_record_created_idx").on(
      table.interviewRecordId,
      table.createdAt,
    ),
    index("interview_notification_event_meeting_created_idx").on(
      table.humanMeetingId,
      table.createdAt,
    ),
    check(
      "interview_notification_event_status_check",
      sql`${table.status} IN ('pending', 'processing', 'completed', 'failed', 'dead', 'cancelled')`,
    ),
    check(
      "interview_notification_event_scope_check",
      sql`(
        (${table.scopeType} = 'interview_record' AND ${table.interviewRecordId} IS NOT NULL)
        OR (${table.scopeType} = 'ai_round' AND ${table.scheduleEntryId} IS NOT NULL)
        OR (${table.scopeType} = 'human_meeting' AND ${table.humanMeetingId} IS NOT NULL)
      )`,
    ),
    check("interview_notification_event_attempt_count_check", sql`${table.attemptCount} >= 0`),
    check(
      "interview_notification_event_lease_pair_check",
      sql`(${table.leaseOwner} IS NULL) = (${table.leaseExpiresAt} IS NULL)`,
    ),
  ],
);

/** @deprecated 已由 recruitingNotificationDelivery 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const interviewNotification = pgTable(
  "interview_notification",
  {
    attemptCount: integer("attempt_count").default(0).notNull(),
    audienceType: text("audience_type").$type<InterviewNotificationAudienceType>(),
    channel: text("channel").$type<InterviewNotificationChannel>(),
    conversationId: text("conversation_id").references(() => interviewConversation.conversationId, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    error: text("error"),
    eventId: text("event_id").references(() => interviewNotificationEvent.id, {
      onDelete: "set null",
    }),
    feishuDocumentId: text("feishu_document_id"),
    feishuDocumentUrl: text("feishu_document_url"),
    feishuMessageId: text("feishu_message_id"),
    id: text("id").primaryKey(),
    interviewRecordId: text("interview_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    lastErrorCode: text("last_error_code"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    leaseOwner: text("lease_owner"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    organizationId: text("organization_id").notNull(),
    providerId: text("provider_id").notNull(),
    providerMessageId: text("provider_message_id"),
    providerRequestKey: text("provider_request_key"),
    recipientAddress: text("recipient_address"),
    recipientDisplayName: text("recipient_display_name"),
    recipientOpenId: text("recipient_open_id").notNull(),
    recipientUserId: text("recipient_user_id"),
    renderedContent: text("rendered_content"),
    renderedSubject: text("rendered_subject"),
    resultUnknownAt: timestamp("result_unknown_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    status: text("status")
      .$type<InterviewNotificationDeliveryStatus>()
      .notNull()
      .default("pending"),
    templateVersionId: text("template_version_id"),
    type: text("type").$type<AgentNotificationType | InterviewNotificationEventType>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("interview_notification_record_idx").on(table.interviewRecordId),
    index("interview_notification_recipient_idx").on(table.recipientUserId),
    index("interview_notification_event_idx").on(table.eventId),
    index("interview_notification_delivery_claim_idx").on(table.status, table.nextAttemptAt),
    uniqueIndex("interview_notification_event_channel_recipient_uq")
      .on(table.eventId, table.channel, table.recipientAddress)
      .where(
        sql`${table.eventId} IS NOT NULL AND ${table.channel} IS NOT NULL AND ${table.recipientAddress} IS NOT NULL`,
      ),
    uniqueIndex("interview_notification_provider_request_uq")
      .on(table.providerRequestKey)
      .where(sql`${table.providerRequestKey} IS NOT NULL`),
    uniqueIndex("interview_notification_once_uq").on(
      table.interviewRecordId,
      table.conversationId,
      table.type,
      table.recipientUserId,
      table.providerId,
    ),
    index("interview_notification_organization_idx").on(table.organizationId),
    check(
      "interview_notification_delivery_status_check",
      sql`${table.status} IN ('pending', 'sending', 'sent', 'failed', 'dead', 'unknown', 'cancelled')`,
    ),
    check("interview_notification_attempt_count_check", sql`${table.attemptCount} >= 0`),
    check(
      "interview_notification_lease_pair_check",
      sql`(${table.leaseOwner} IS NULL) = (${table.leaseExpiresAt} IS NULL)`,
    ),
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

/** @deprecated 已由 recruitingFormSubmission 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const candidateFormSubmission = pgTable(
  "candidate_form_submission",
  {
    answers: jsonb("answers").$type<Record<string, string | string[]>>().notNull().default({}),
    id: text("id").primaryKey(),
    interviewRecordId: text("interview_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    templateId: text("template_id").notNull(),
    versionId: text("version_id").notNull(),
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
/** @deprecated 已由 recruitingQuestionTemplateBinding 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const interviewQuestionTemplateBinding = pgTable(
  "interview_question_template_binding",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    disabledByUser: boolean("disabled_by_user").default(false).notNull(),
    id: text("id").primaryKey(),
    interviewRecordId: text("interview_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    sortOrder: integer("sort_order").notNull(),
    templateId: text("template_id").notNull(),
    versionId: text("version_id").notNull(),
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

/** @deprecated 已由 recruitingContextSnapshot 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const interviewContextSnapshot = pgTable(
  "interview_context_snapshot",
  {
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by"),
    id: text("id").primaryKey(),
    interviewRecordId: text("interview_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
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

/** @deprecated 已由 recruitingEvidenceSnapshot 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
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
    organizationId: text("organization_id").notNull(),
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

/** @deprecated 已由 recruitingRoundEmailLog 等新招聘表替代；仅保留迁移和历史核对，业务代码不得读写。 */
export const studioRoundEmailLog = pgTable(
  "studio_round_email_log",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    errorMessage: text("error_message"),
    id: text("id").primaryKey(),
    interviewRecordId: text("interview_record_id")
      .notNull()
      .references(() => studioInterview.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    resendMessageId: text("resend_message_id"),
    roundId: text("round_id")
      .notNull()
      .references(() => studioInterviewSchedule.id, { onDelete: "cascade" }),
    sentBy: text("sent_by"),
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

// =====================================================================
/* oxlint-disable no-use-before-define -- 新表外键在 Drizzle 读取表配置时延迟求值，支持当前评估等双向引用。 */
// 招聘新模型：仅新增目标表。旧 studioInterview 及附属表保留供核对与后续复制回填。
// 当前业务尚未切换；这里的定义不会自行创建数据库表或触发数据迁移。
// 外键原则：归属复合外键已覆盖单列引用时只保留一条，所属子项沿用级联删除。
// 可选历史引用统一由复合外键保护；物理删除前须在事务内显式解除引用。
// 不叠加单列 SET NULL，以免与复合校验冲突；也不对非空工作区列执行 SET NULL。
// 结束、淘汰和重新打开只更新流程状态，不能通过删除轮次或记录实现。
// 可空招聘 ID 会使三列外键跳过校验，因此部分表仍需保留“轮次 + 工作区”外键。
// 含主键的复合唯一索引仅用于外键目标；筛选索引按工作区、节点、状态和结果保留。
// =====================================================================

/** 招聘具体节点；面试和 Offer 的大阶段由节点分组得出，不另存重复状态。 */
export const recruitingNodeValues = [
  "screening",
  "ai_interview",
  "second_interview",
  "final_interview",
  "income_proof",
  "offer",
  "background_check",
  "onboarding",
] as const;
export type RecruitingNode = (typeof recruitingNodeValues)[number];
export type RecruitingStage = RecruitingNode | "closed";
/** 节点内进度；inactive 表示尚未到达或回退后已失效，skipped 表示明确跳过。 */
export type RecruitingNodeStatus =
  | "inactive"
  | "pending"
  | "scheduled"
  | "in_progress"
  | "awaiting_review"
  | "negotiating"
  | "awaiting_send"
  | "awaiting_response"
  | "completed"
  | "skipped";
export type RecruitingNodeResult = "pass" | "fail" | "withdrawn";
export type RecruitingCloseReason =
  | "resume_rejected"
  | "interview_failed"
  | "salary_disagreement"
  | "offer_declined"
  | "background_check_failed"
  | "candidate_withdrew"
  | "onboarding_no_show"
  | "position_closed"
  | "onboarded"
  | "other";
/** 新招聘检索使用自己的来源标识，不更改旧语义索引的来源契约。 */
export type RecruitingSearchSource = "resume_pool_item" | "recruiting_record" | "job_description";

// 人才身份：不以姓名、电话或邮箱建立唯一约束，迁移时不自动合并疑似同一人。
export const candidate = pgTable(
  "candidate",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by"),
    email: text("email"),
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    organizationId: text("organization_id").notNull(),
    phone: text("phone"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "candidate_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [user.id],
      name: "candidate_created_by_fk",
    }).onDelete("set null"),
    uniqueIndex("candidate_id_org_uq").on(table.id, table.organizationId),
    index("candidate_org_created_idx").on(table.organizationId, table.createdAt),
    index("candidate_org_email_idx").on(table.organizationId, table.email),
    index("candidate_org_phone_idx").on(table.organizationId, table.phone),
  ],
);

// 简历版本：只保存候选人提供的材料及解析结果，不保存针对某岗位的筛选决定。
// 替换简历时创建新版本，旧招聘和评估仍可引用其原始依据；文件保留对象存储键。
export const candidateResume = pgTable(
  "candidate_resume",
  {
    candidateId: text("candidate_id").notNull(),
    contentHash: text("content_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by"),
    fileName: text("file_name"),
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    parseError: text("parse_error"),
    parseStatus: text("parse_status").$type<ResumeParseStatus>().notNull().default("unparsed"),
    parsedAt: timestamp("parsed_at", { withTimezone: true }),
    profile: jsonb("profile").$type<ResumeProfile>(),
    searchCjkBigrams: text("search_cjk_bigrams").array(),
    // 搜索字段是解析资料的投影，未来由写入链路维护，不允许作为第二套人工资料编辑。
    searchText: text("search_text"),
    skillsNormalized: text("skills_normalized")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    storageKey: text("storage_key"),
    text: text("text"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    version: integer("version").notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "candidate_resume_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [user.id],
      name: "candidate_resume_created_by_fk",
    }).onDelete("set null"),
    uniqueIndex("candidate_resume_id_org_uq").on(table.id, table.organizationId),
    foreignKey({
      columns: [table.candidateId, table.organizationId],
      foreignColumns: [candidate.id, candidate.organizationId],
      name: "candidate_resume_candidate_org_fk",
    }).onDelete("cascade"),
    uniqueIndex("candidate_resume_id_candidate_org_uq").on(
      table.id,
      table.candidateId,
      table.organizationId,
    ),
    uniqueIndex("candidate_resume_candidate_version_uq").on(table.candidateId, table.version),
    index("candidate_resume_org_hash_idx").on(table.organizationId, table.contentHash),
    index("candidate_resume_search_text_idx").using(
      "gin",
      table.searchText.asc().op("gin_trgm_ops"),
    ),
    index("candidate_resume_bigrams_idx").using("gin", table.searchCjkBigrams),
    index("candidate_resume_skills_idx").using("gin", table.skillsNormalized),
    check("candidate_resume_version_check", sql`${table.version} > 0`),
    check(
      "candidate_resume_parse_status_check",
      sql`${table.parseStatus} IN ('unparsed', 'queued', 'processing', 'ready', 'failed')`,
    ),
  ],
);

// 招聘记录：一名人才针对一个岗位的招聘过程。重新打开修改本记录，不产生招聘周期。
// ID 可沿用旧招聘记录 ID；不能把它同时用作人才 ID 或简历 ID。
export const recruitingRecord = pgTable(
  "recruiting_record",
  {
    activeEvaluationId: text("active_evaluation_id"),
    candidateId: text("candidate_id").notNull(),
    // 仅保存结束备注等非筛选详情，结束节点和原因以独立列为准。
    closeDetails: jsonb("close_details").$type<JsonObject>(),
    closeReason: text("close_reason").$type<RecruitingCloseReason>(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedFromNode: text("closed_from_node").$type<RecruitingNode>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by"),
    // 当前成功结果和正在生成的尝试分别引用；失败重评不得抹掉当前有效结果。
    currentEvaluationId: text("current_evaluation_id"),
    currentStage: text("current_stage").$type<RecruitingStage>().notNull().default("screening"),
    // 人工简历评语与节点筛选结论分开；AI 推荐不能自动代替筛选决定。
    hrResumeAssessment: text("hr_resume_assessment"),
    hrResumeAssessmentUpdatedAt: timestamp("hr_resume_assessment_updated_at", {
      withTimezone: true,
    }),
    hrResumeAssessmentUpdatedBy: text("hr_resume_assessment_updated_by"),
    id: text("id").primaryKey(),
    jobDescriptionId: text("job_description_id"),
    notes: text("notes"),
    organizationId: text("organization_id").notNull(),
    outcome: text("outcome").$type<CandidateOutcome>().notNull().default("in_pipeline"),
    ownerId: text("owner_id"),
    // 直接创建 AI 面试可以尚无简历；一旦选定，必须属于同一人才和工作区。
    resumeId: text("resume_id"),
    sourceImportedAt: timestamp("source_imported_at", { withTimezone: true }),
    sourceImportedBy: text("source_imported_by"),
    sourcePoolItemId: text("source_pool_item_id"),
    sourceType: text("source_type").$type<StudioInterviewResumeSourceType>(),
    // 历史进入时间不可证明时保持空值，不以回填时间冒充历史进入时间。
    stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true }),
    targetRole: text("target_role"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    version: integer("version").notNull().default(0),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "recruiting_record_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.jobDescriptionId],
      foreignColumns: [jobDescription.id],
      name: "recruiting_record_job_description_id_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.hrResumeAssessmentUpdatedBy],
      foreignColumns: [user.id],
      name: "recruiting_record_hr_resume_assessment_updated_by_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.sourcePoolItemId],
      foreignColumns: [resumePoolItem.id],
      name: "recruiting_record_source_pool_item_id_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.sourceImportedBy],
      foreignColumns: [user.id],
      name: "recruiting_record_source_imported_by_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [user.id],
      name: "recruiting_record_created_by_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.ownerId],
      foreignColumns: [user.id],
      name: "recruiting_record_owner_id_fk",
    }).onDelete("set null"),
    uniqueIndex("recruiting_record_id_org_uq").on(table.id, table.organizationId),
    foreignKey({
      columns: [table.candidateId, table.organizationId],
      foreignColumns: [candidate.id, candidate.organizationId],
      name: "recruiting_record_candidate_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.resumeId, table.candidateId, table.organizationId],
      foreignColumns: [
        candidateResume.id,
        candidateResume.candidateId,
        candidateResume.organizationId,
      ],
      name: "recruiting_record_resume_owner_fk",
    }),
    foreignKey({
      columns: [table.currentEvaluationId, table.id, table.organizationId],
      foreignColumns: [
        recruitingResumeEvaluation.id,
        recruitingResumeEvaluation.recruitingRecordId,
        recruitingResumeEvaluation.organizationId,
      ],
      name: "recruiting_record_current_evaluation_fk",
    }),
    foreignKey({
      columns: [table.activeEvaluationId, table.id, table.organizationId],
      foreignColumns: [
        recruitingResumeEvaluation.id,
        recruitingResumeEvaluation.recruitingRecordId,
        recruitingResumeEvaluation.organizationId,
      ],
      name: "recruiting_record_active_evaluation_fk",
    }),
    index("recruiting_record_org_stage_time_idx").on(
      table.organizationId,
      table.currentStage,
      table.stageEnteredAt,
    ),
    index("recruiting_record_org_outcome_reason_idx").on(
      table.organizationId,
      table.outcome,
      table.closeReason,
    ),
    index("recruiting_record_org_creator_created_idx").on(
      table.organizationId,
      table.createdBy,
      table.createdAt,
    ),
    index("recruiting_record_org_owner_stage_idx").on(
      table.organizationId,
      table.ownerId,
      table.currentStage,
    ),
    index("recruiting_record_org_job_idx").on(table.organizationId, table.jobDescriptionId),
    index("recruiting_record_candidate_idx").on(table.candidateId),
    check(
      "recruiting_record_stage_check",
      sql`${table.currentStage} IN ('screening', 'ai_interview', 'second_interview', 'final_interview', 'income_proof', 'offer', 'background_check', 'onboarding', 'closed')`,
    ),
    check(
      "recruiting_record_outcome_check",
      sql`${table.outcome} IN ('in_pipeline', 'hired', 'rejected', 'withdrawn', 'archived')`,
    ),
    check(
      "recruiting_record_end_check",
      sql`(${table.currentStage} = 'closed' AND ${table.outcome} <> 'in_pipeline' AND ${table.closedAt} IS NOT NULL) OR (${table.currentStage} <> 'closed' AND ${table.outcome} = 'in_pipeline' AND ${table.closedAt} IS NULL AND ${table.closedFromNode} IS NULL AND ${table.closeReason} IS NULL AND ${table.closeDetails} IS NULL)`,
    ),
    check(
      "recruiting_record_closed_node_check",
      sql`${table.closedFromNode} IS NULL OR ${table.closedFromNode} IN ('screening', 'ai_interview', 'second_interview', 'final_interview', 'income_proof', 'offer', 'background_check', 'onboarding')`,
    ),
    check(
      "recruiting_record_reason_check",
      sql`${table.closeReason} IS NULL OR ${table.closeReason} IN ('resume_rejected', 'interview_failed', 'salary_disagreement', 'offer_declined', 'background_check_failed', 'candidate_withdrew', 'onboarding_no_show', 'position_closed', 'onboarded', 'other')`,
    ),
    check("recruiting_record_version_check", sql`${table.version} >= 0`),
  ],
);

// 岗位相关评估：容纳成功版本与生成尝试，不把旧数字评分转换成定性等级。
// contractVersion 和 artifact 保留原契约；kind 区分简历评估与历史规则筛选。
export const recruitingResumeEvaluation = pgTable(
  "recruiting_resume_evaluation",
  {
    artifact: jsonb("artifact").$type<JsonValue>(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    contractVersion: text("contract_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    errorMessage: text("error_message"),
    id: text("id").primaryKey(),
    inputHash: text("input_hash"),
    jobDescriptionVersionId: text("job_description_version_id"),
    kind: text("kind")
      .$type<"resume_review" | "resume_screening">()
      .notNull()
      .default("resume_review"),
    numericScore: integer("numeric_score"),
    organizationId: text("organization_id").notNull(),
    recommendationLevel: text("recommendation_level").$type<QualitativeRecommendationLevel>(),
    recruitingRecordId: text("recruiting_record_id").notNull(),
    resumeId: text("resume_id"),
    runId: text("run_id"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    status: text("status").$type<"queued" | "processing" | "succeeded" | "failed">().notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "recruiting_resume_evaluation_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.jobDescriptionVersionId],
      foreignColumns: [jobDescriptionVersion.id],
      name: "recruiting_resume_evaluation_job_description_version_id_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.resumeId, table.organizationId],
      foreignColumns: [candidateResume.id, candidateResume.organizationId],
      name: "recruiting_resume_evaluation_resume_id_org_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "recruiting_evaluation_record_org_fk",
    }).onDelete("cascade"),
    uniqueIndex("recruiting_evaluation_id_record_org_uq").on(
      table.id,
      table.recruitingRecordId,
      table.organizationId,
    ),
    uniqueIndex("recruiting_evaluation_run_uq")
      .on(table.recruitingRecordId, table.kind, table.contractVersion, table.runId)
      .where(sql`${table.runId} IS NOT NULL`),
    index("recruiting_evaluation_org_level_idx").on(
      table.organizationId,
      table.recommendationLevel,
    ),
    index("recruiting_evaluation_record_created_idx").on(table.recruitingRecordId, table.createdAt),
    check(
      "recruiting_evaluation_kind_check",
      sql`${table.kind} IN ('resume_review', 'resume_screening')`,
    ),
    check(
      "recruiting_evaluation_status_check",
      sql`${table.status} IN ('queued', 'processing', 'succeeded', 'failed')`,
    ),
    check(
      "recruiting_evaluation_artifact_check",
      sql`${table.status} <> 'succeeded' OR ${table.artifact} IS NOT NULL`,
    ),
    check(
      "recruiting_evaluation_error_check",
      sql`${table.status} <> 'failed' OR ${table.errorMessage} IS NOT NULL`,
    ),
    check(
      "recruiting_evaluation_score_check",
      sql`${table.numericScore} IS NULL OR ${table.numericScore} BETWEEN 0 AND 100`,
    ),
    check(
      "recruiting_evaluation_level_check",
      sql`${table.recommendationLevel} IS NULL OR ${table.recommendationLevel} IN ('not_recommended', 'undecided', 'recommended', 'highly_recommended')`,
    ),
  ],
);

// 面试准备资料独立于流程主表，保留原人工确认的问题；模板绑定另有版本化关联表。
export const recruitingInterviewPreparation = pgTable(
  "recruiting_interview_preparation",
  {
    organizationId: text("organization_id").notNull(),
    questions: jsonb("questions").$type<InterviewQuestion[]>().notNull().default([]),
    recruitingRecordId: text("recruiting_record_id").primaryKey(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "recruiting_preparation_record_org_fk",
    }).onDelete("cascade"),
  ],
);

// 录用办理详情：节点进度与最终结论以 recruitingNodeState 为准，避免双重状态来源。
// 薪资条款只保存在选定的 Offer 版本；重新打开不创建第二套办理记录。
export const recruitingFulfillment = pgTable(
  "recruiting_fulfillment",
  {
    actualJoiningDate: date("actual_joining_date"),
    backgroundCheckCompletedAt: timestamp("background_check_completed_at", { withTimezone: true }),
    backgroundCheckNotes: text("background_check_notes"),
    backgroundCheckStartedAt: timestamp("background_check_started_at", { withTimezone: true }),
    candidateExpectations: jsonb("candidate_expectations").$type<CandidateExpectationsMeta>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // 入职是日期，不是瞬时时间；确认动作另外保留带时区的时间。
    expectedJoiningDate: date("expected_joining_date"),
    incomeProofNotes: text("income_proof_notes"),
    negotiationNotes: text("negotiation_notes"),
    onboardingConfirmedAt: timestamp("onboarding_confirmed_at", { withTimezone: true }),
    onboardingConfirmedBy: text("onboarding_confirmed_by"),
    onboardingContact: text("onboarding_contact"),
    organizationId: text("organization_id").notNull(),
    recruitingRecordId: text("recruiting_record_id").primaryKey(),
    selectedOfferId: text("selected_offer_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.onboardingConfirmedBy],
      foreignColumns: [user.id],
      name: "recruiting_fulfillment_onboarding_confirmed_by_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "recruiting_fulfillment_record_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.selectedOfferId, table.recruitingRecordId, table.organizationId],
      foreignColumns: [
        recruitingOffer.id,
        recruitingOffer.recruitingRecordId,
        recruitingOffer.organizationId,
      ],
      name: "recruiting_fulfillment_offer_owner_fk",
    }),
    index("recruiting_fulfillment_org_joining_idx").on(
      table.organizationId,
      table.expectedJoiningDate,
    ),
  ],
);

// 流程材料只存元数据；上传和下载权限必须按招聘记录检查，不能复用公开面试链接权限。
export const recruitingMaterial = pgTable(
  "recruiting_material",
  {
    contentType: text("content_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    fileName: text("file_name").notNull(),
    id: text("id").primaryKey(),
    kind: text("kind").$type<"income_proof" | "background_report" | "offer_document">().notNull(),
    organizationId: text("organization_id").notNull(),
    recruitingRecordId: text("recruiting_record_id").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    storageKey: text("storage_key").notNull(),
    uploadedBy: text("uploaded_by"),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.uploadedBy],
      foreignColumns: [user.id],
      name: "recruiting_material_uploaded_by_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "recruiting_material_record_org_fk",
    }).onDelete("cascade"),
    index("recruiting_material_record_kind_idx").on(
      table.organizationId,
      table.recruitingRecordId,
      table.kind,
    ),
    check(
      "recruiting_material_kind_check",
      sql`${table.kind} IN ('income_proof', 'background_report', 'offer_document')`,
    ),
    check(
      "recruiting_material_size_check",
      sql`${table.sizeBytes} >= 0 AND ${table.sizeBytes} <= 9007199254740991`,
    ),
  ],
);

// 每个节点仅一条当前有效状态。回退将下游状态置 inactive，原依据先写入 recruitingEvent。
// 业务轮次的原始评价继续保留；筛选只读取这里明确选定的有效结果。
export const recruitingNodeState = pgTable(
  "recruiting_node_state",
  {
    completedAt: timestamp("completed_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: text("decided_by"),
    effectiveAiRoundId: text("effective_ai_round_id"),
    effectiveHumanRoundId: text("effective_human_round_id"),
    effectiveOfferId: text("effective_offer_id"),
    enteredAt: timestamp("entered_at", { withTimezone: true }),
    node: text("node").$type<RecruitingNode>().notNull(),
    organizationId: text("organization_id").notNull(),
    reason: text("reason"),
    recruitingRecordId: text("recruiting_record_id").notNull(),
    result: text("result").$type<RecruitingNodeResult>(),
    status: text("status").$type<RecruitingNodeStatus>().notNull().default("inactive"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.decidedBy],
      foreignColumns: [user.id],
      name: "recruiting_node_state_decided_by_fk",
    }).onDelete("set null"),
    primaryKey({ columns: [table.recruitingRecordId, table.node] }),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "recruiting_node_record_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.effectiveAiRoundId, table.recruitingRecordId, table.organizationId],
      foreignColumns: [
        aiInterviewRound.id,
        aiInterviewRound.recruitingRecordId,
        aiInterviewRound.organizationId,
      ],
      name: "recruiting_node_ai_owner_fk",
    }),
    foreignKey({
      columns: [
        table.effectiveHumanRoundId,
        table.recruitingRecordId,
        table.organizationId,
        table.node,
      ],
      foreignColumns: [
        humanInterviewRound.id,
        humanInterviewRound.recruitingRecordId,
        humanInterviewRound.organizationId,
        humanInterviewRound.roundKind,
      ],
      name: "recruiting_node_human_owner_fk",
    }),
    foreignKey({
      columns: [table.effectiveOfferId, table.recruitingRecordId, table.organizationId],
      foreignColumns: [
        recruitingOffer.id,
        recruitingOffer.recruitingRecordId,
        recruitingOffer.organizationId,
      ],
      name: "recruiting_node_offer_owner_fk",
    }),
    index("recruiting_node_org_node_status_idx").on(
      table.organizationId,
      table.node,
      table.status,
      table.recruitingRecordId,
    ),
    index("recruiting_node_org_node_result_idx").on(
      table.organizationId,
      table.node,
      table.result,
      table.recruitingRecordId,
    ),
    check(
      "recruiting_node_kind_check",
      sql`${table.node} IN ('screening', 'ai_interview', 'second_interview', 'final_interview', 'income_proof', 'offer', 'background_check', 'onboarding')`,
    ),
    check(
      "recruiting_node_status_check",
      sql`${table.status} IN ('inactive', 'pending', 'scheduled', 'in_progress', 'awaiting_review', 'negotiating', 'awaiting_send', 'awaiting_response', 'completed', 'skipped')`,
    ),
    check(
      "recruiting_node_result_check",
      sql`${table.result} IS NULL OR ${table.result} IN ('pass', 'fail', 'withdrawn')`,
    ),
    check(
      "recruiting_node_result_status_check",
      sql`(${table.status} = 'completed' AND ${table.result} IS NOT NULL) OR (${table.status} <> 'completed' AND ${table.result} IS NULL)`,
    ),
    check(
      "recruiting_node_progress_check",
      sql`(${table.status} IN ('inactive', 'pending', 'completed', 'skipped')) OR (${table.node} IN ('ai_interview', 'second_interview', 'final_interview') AND ${table.status} IN ('scheduled', 'in_progress', 'awaiting_review')) OR (${table.node} IN ('income_proof', 'background_check') AND ${table.status} IN ('in_progress', 'awaiting_review')) OR (${table.node} = 'offer' AND ${table.status} IN ('negotiating', 'awaiting_send', 'awaiting_response'))`,
    ),
    check(
      "recruiting_node_evidence_check",
      sql`(${table.effectiveAiRoundId} IS NULL OR ${table.node} = 'ai_interview') AND (${table.effectiveHumanRoundId} IS NULL OR ${table.node} IN ('second_interview', 'final_interview')) AND (${table.effectiveOfferId} IS NULL OR ${table.node} = 'offer')`,
    ),
    check(
      "recruiting_node_inactive_check",
      sql`${table.status} NOT IN ('inactive', 'skipped') OR (${table.effectiveAiRoundId} IS NULL AND ${table.effectiveHumanRoundId} IS NULL AND ${table.effectiveOfferId} IS NULL)`,
    ),
  ],
);

// 复制回填的身份台账。仅保存源身份与目标身份，不以外键依赖旧表，不执行复制操作。
// 同一源行可能拆成多种目标实体，因此唯一键包含目标表；重跑使用已记录的目标 ID。
export const recruitingMigrationMap = pgTable(
  "recruiting_migration_map",
  {
    copiedAt: timestamp("copied_at", { withTimezone: true }).notNull().defaultNow(),
    sourceHash: text("source_hash").notNull(),
    sourceKey: text("source_key").notNull(),
    sourceTable: text("source_table").notNull(),
    targetKey: text("target_key").notNull(),
    targetTable: text("target_table").notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    primaryKey({ columns: [table.sourceTable, table.sourceKey, table.targetTable] }),
    uniqueIndex("recruiting_migration_target_uq").on(table.targetTable, table.targetKey),
  ],
);

// AI 面试轮次：保留邀请 token、有效期、会话和断线重连锚点；面试执行完成不等于人工确认通过。
export const aiInterviewRound = pgTable(
  "ai_interview_round",
  {
    allowTextInput: boolean("allow_text_input").notNull().default(false),
    candidateDeclineReason: text("candidate_decline_reason"),
    candidateFeedbackCategories: jsonb("candidate_feedback_categories").$type<
      CandidateInterviewFeedbackCategory[] | null
    >(),
    candidateFeedbackDetail: text("candidate_feedback_detail"),
    candidateFeedbackSubmittedAt: timestamp("candidate_feedback_submitted_at", {
      withTimezone: true,
    }),
    candidateInviteExpiresAt: timestamp("candidate_invite_expires_at", { withTimezone: true }),
    candidateInviteStatus: text("candidate_invite_status")
      .$type<CandidateInterviewInvitationStatus>()
      .notNull()
      .default("pending"),
    candidateInviteTokenHash: text("candidate_invite_token_hash"),
    candidateRespondedAt: timestamp("candidate_responded_at", { withTimezone: true }),
    conversationId: text("conversation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by"),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    id: text("id").primaryKey(),
    invitationVersion: integer("invitation_version").notNull().default(1),
    liveKitParticipantIdentity: text("livekit_participant_identity"),
    liveKitRoomName: text("livekit_room_name"),
    notes: text("notes"),
    organizationId: text("organization_id").notNull(),
    recruitingRecordId: text("recruiting_record_id").notNull(),
    reviewNotes: text("review_notes"),
    // 人工决定；原 AI 执行状态和报告内容不自动写入此结论。
    reviewOutcome: text("review_outcome").$type<"pass" | "fail">(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
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
  (table): PgTableExtraConfigValue[] => [
    // 当前会话必须属于本轮次和工作区，不能误指向另一位候选人的会话。
    foreignKey({
      columns: [table.conversationId, table.id, table.organizationId],
      foreignColumns: [
        aiInterviewConversation.conversationId,
        aiInterviewConversation.aiRoundId,
        aiInterviewConversation.organizationId,
      ],
      name: "ai_round_current_conversation_fk",
    }),
    check(
      "ai_round_status_check",
      sql`${table.status} IN ('pending','in_progress','interrupted','completed')`,
    ),
    foreignKey({
      columns: [table.reviewedBy],
      foreignColumns: [user.id],
      name: "ai_interview_round_reviewed_by_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [user.id],
      name: "ai_interview_round_created_by_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "ai_interview_round_organization_id_fk",
    }).onDelete("cascade"),
    uniqueIndex("ai_interview_round_id_org_uq").on(table.id, table.organizationId),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "ai_interview_round_recruiting_record_id_org_fk",
    }).onDelete("cascade"),
    uniqueIndex("ai_interview_round_id_record_org_uq").on(
      table.id,
      table.recruitingRecordId,
      table.organizationId,
    ),
    check(
      "ai_round_review_check",
      sql`${table.reviewOutcome} IS NULL OR ${table.reviewOutcome} IN ('pass', 'fail')`,
    ),
    index("ai_interview_round_sort_idx").on(table.recruitingRecordId, table.sortOrder),
    index("ai_interview_round_created_by_idx").on(table.createdBy),
    index("ai_interview_round_org_created_at_idx").on(table.organizationId, table.createdAt),
    index("ai_interview_round_org_created_by_created_at_idx").on(
      table.organizationId,
      table.createdBy,
      table.createdAt,
    ),
    index("ai_interview_round_org_status_created_at_idx").on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
    uniqueIndex("ai_interview_round_invite_token_uq")
      .on(table.candidateInviteTokenHash)
      .where(sql`${table.candidateInviteTokenHash} IS NOT NULL`),
    check(
      "ai_interview_round_invite_status_check",
      sql`${table.candidateInviteStatus} IN ('pending', 'sent', 'accepted', 'declined', 'expired')`,
    ),
    check("ai_interview_round_invitation_version_check", sql`${table.invitationVersion} > 0`),
  ],
);

// 真人面试轮次：明确区分复试和终面，取消重排仍保留原轮次。原始评价与流程采用的结果分开。
export const humanInterviewRound = pgTable(
  "human_interview_round",
  {
    cancelReason: text("cancel_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    evaluation: jsonb("evaluation").$type<HumanInterviewEvaluation>(),
    evaluationError: text("evaluation_error"),
    evaluationStatus: text("evaluation_status")
      .$type<HumanInterviewEvaluationStatus>()
      .notNull()
      .default("not_started"),
    evaluationSubmittedAt: timestamp("evaluation_submitted_at", { withTimezone: true }),
    evaluationTranscriptRevisionId: text("evaluation_transcript_revision_id"),
    evaluationUpdatedAt: timestamp("evaluation_updated_at", { withTimezone: true }),
    evaluationUpdatedBy: text("evaluation_updated_by"),
    feedback: text("feedback"),
    format: text("format").$type<HumanInterviewFormat>().notNull(),
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    location: text("location"),
    meetingUrl: text("meeting_url"),
    notes: text("notes"),
    organizationId: text("organization_id").notNull(),
    outcome: text("outcome").$type<HumanInterviewRoundOutcome>(),
    recruitingRecordId: text("recruiting_record_id").notNull(),
    // 名称可自定义，流转只按轮次类型判定；历史无法归类的记录须在回填前明确映射。
    roundKind: text("round_kind").$type<"second_interview" | "final_interview">().notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    score: integer("score"),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status").$type<HumanInterviewRoundStatus>().notNull().default("pending"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    check("human_round_status_check", sql`${table.status} IN ('pending','completed','cancelled')`),
    check(
      "human_round_outcome_check",
      sql`${table.outcome} IS NULL OR ${table.outcome} IN ('pass','fail','inconclusive')`,
    ),
    foreignKey({
      columns: [table.evaluationTranscriptRevisionId],
      foreignColumns: [meetingTranscriptRevision.id],
      name: "human_interview_round_evaluation_transcript_revision_id_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.evaluationUpdatedBy],
      foreignColumns: [user.id],
      name: "human_interview_round_evaluation_updated_by_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "human_interview_round_organization_id_fk",
    }).onDelete("cascade"),
    uniqueIndex("human_interview_round_id_org_uq").on(table.id, table.organizationId),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "human_interview_round_recruiting_record_id_org_fk",
    }).onDelete("cascade"),
    uniqueIndex("human_interview_round_id_record_org_uq").on(
      table.id,
      table.recruitingRecordId,
      table.organizationId,
    ),
    uniqueIndex("human_round_id_record_org_kind_uq").on(
      table.id,
      table.recruitingRecordId,
      table.organizationId,
      table.roundKind,
    ),
    check(
      "human_round_kind_check",
      sql`${table.roundKind} IN ('second_interview', 'final_interview')`,
    ),
    index("human_round_org_kind_result_idx").on(
      table.organizationId,
      table.roundKind,
      table.outcome,
    ),
    index("human_interview_round_sort_idx").on(table.recruitingRecordId, table.sortOrder),
    index("human_interview_round_status_idx").on(table.status),
    index("human_interview_round_evaluation_status_idx").on(table.evaluationStatus),
    check(
      "human_interview_round_evaluation_status_check",
      sql`${table.evaluationStatus} in ('not_started', 'generating', 'draft', 'submitted', 'failed')`,
    ),
  ],
);

// 真人评价快照：保留 AI 草稿及人工提交的原始评价，回退不覆盖历史。
export const humanInterviewEvaluationSnapshot = pgTable(
  "human_interview_evaluation_snapshot",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by"),
    evaluation: jsonb("evaluation").$type<HumanInterviewEvaluation>().notNull(),
    id: text("id").primaryKey(),
    meetingSessionId: text("meeting_session_id"),
    organizationId: text("organization_id").notNull(),
    outcome: text("outcome").$type<HumanInterviewRoundOutcome>(),
    roundId: text("round_id").notNull(),
    source: text("source").$type<HumanInterviewEvaluationSnapshotSource>().notNull(),
    transcriptRevisionId: text("transcript_revision_id"),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [user.id],
      name: "human_interview_evaluation_snapshot_created_by_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.meetingSessionId],
      foreignColumns: [meetingSession.id],
      name: "human_interview_evaluation_snapshot_meeting_session_id_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "human_interview_evaluation_snapshot_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.transcriptRevisionId],
      foreignColumns: [meetingTranscriptRevision.id],
      name: "human_interview_evaluation_snapshot_transcript_revision_id_fk",
    }).onDelete("set null"),
    uniqueIndex("human_interview_evaluation_snapshot_id_org_uq").on(table.id, table.organizationId),
    foreignKey({
      columns: [table.roundId, table.organizationId],
      foreignColumns: [humanInterviewRound.id, humanInterviewRound.organizationId],
      name: "human_interview_evaluation_snapshot_round_id_org_fk",
    }).onDelete("cascade"),
    index("human_interview_evaluation_snapshot_round_created_idx").on(
      table.roundId,
      table.createdAt,
    ),
    index("human_interview_evaluation_snapshot_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    check(
      "human_interview_evaluation_snapshot_source_check",
      sql`${table.source} in ('ai_generated', 'human_submitted')`,
    ),
  ],
);

// 真人评价文档同步任务：保留原外部文档、重试与租约状态，后续复制不得重新触发已完成同步。
export const humanInterviewEvaluationDocumentSync = pgTable(
  "human_interview_evaluation_document_sync",
  {
    attemptCount: integer("attempt_count").notNull().default(0),
    blockId: text("block_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    documentId: text("document_id"),
    documentUrl: text("document_url"),
    error: text("error"),
    leaseOwner: text("lease_owner"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    organizationId: text("organization_id").notNull(),
    providerId: text("provider_id"),
    roundId: text("round_id").notNull().unique(),
    snapshotId: text("snapshot_id").primaryKey(),
    status: text("status")
      .$type<"pending" | "syncing" | "waiting_document" | "failed" | "synced">()
      .notNull()
      .default("pending"),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "human_interview_evaluation_document_sync_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.roundId, table.organizationId],
      foreignColumns: [humanInterviewRound.id, humanInterviewRound.organizationId],
      name: "human_interview_evaluation_document_sync_round_id_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.snapshotId, table.organizationId],
      foreignColumns: [
        humanInterviewEvaluationSnapshot.id,
        humanInterviewEvaluationSnapshot.organizationId,
      ],
      name: "human_interview_evaluation_document_sync_snapshot_id_org_fk",
    }).onDelete("cascade"),
    index("human_interview_evaluation_document_sync_due_idx").on(table.status, table.nextAttemptAt),
    check(
      "human_interview_evaluation_document_sync_status_check",
      sql`${table.status} in ('pending', 'syncing', 'waiting_document', 'failed', 'synced')`,
    ),
  ],
);

// 真人面试会议：管理排期、房间、录音及外部会议身份，通用会议处理仍引用独立 meetingSession。
export const humanInterviewMeeting = pgTable(
  "human_interview_meeting",
  {
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    candidateRecordingDurationMs: integer("candidate_recording_duration_ms"),
    candidateRecordingEgressId: text("candidate_recording_egress_id"),
    candidateRecordingError: text("candidate_recording_error"),
    candidateRecordingFileKey: text("candidate_recording_file_key"),
    candidateRecordingSizeBytes: integer("candidate_recording_size_bytes"),
    candidateRecordingStatus: text("candidate_recording_status")
      .$type<HumanInterviewRecordingStatus>()
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by"),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    feishuAppLink: text("feishu_app_link"),
    feishuAttendeeOpenIds: jsonb("feishu_attendee_open_ids").$type<string[]>(),
    feishuCalendarEventId: text("feishu_calendar_event_id"),
    feishuCalendarEventUrl: text("feishu_calendar_event_url"),
    feishuCalendarId: text("feishu_calendar_id"),
    feishuLastError: text("feishu_last_error"),
    feishuMeetingId: text("feishu_meeting_id"),
    feishuMeetingNo: text("feishu_meeting_no"),
    feishuMeetingUrl: text("feishu_meeting_url"),
    feishuOwnerOpenId: text("feishu_owner_open_id"),
    feishuProviderId: text("feishu_provider_id").$type<FeishuHumanInterviewProviderId>(),
    feishuReserveId: text("feishu_reserve_id"),
    feishuSyncStatus: text("feishu_sync_status").$type<FeishuHumanInterviewSyncStatus>(),
    feishuSyncedAt: timestamp("feishu_synced_at", { withTimezone: true }),
    id: text("id").primaryKey(),
    lifecycleOccurredAt: timestamp("lifecycle_occurred_at", { withTimezone: true }),
    lifecycleSource: text("lifecycle_source").$type<HumanInterviewMeetingLifecycleSource>(),
    liveKitRoomName: text("livekit_room_name"),
    notes: text("notes"),
    organizationId: text("organization_id").notNull(),
    processingMeetingSessionId: text("processing_meeting_session_id").unique(),
    recordingDurationMs: integer("recording_duration_ms"),
    recordingEgressId: text("recording_egress_id"),
    recordingError: text("recording_error"),
    recordingFileKey: text("recording_file_key"),
    recordingSizeBytes: integer("recording_size_bytes"),
    recordingStatus: text("recording_status")
      .$type<HumanInterviewRecordingStatus>()
      .notNull()
      .default("pending"),
    recordingTracks: jsonb("recording_tracks").$type<HumanInterviewRecordingTrack[]>(),
    scheduleVersion: integer("schedule_version").notNull().default(1),
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
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [user.id],
      name: "human_interview_meeting_created_by_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "human_interview_meeting_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.processingMeetingSessionId],
      foreignColumns: [meetingSession.id],
      name: "human_interview_meeting_processing_meeting_session_id_fk",
    }).onDelete("set null"),
    index("human_interview_meeting_schedule_idx").on(table.organizationId, table.scheduledAt),
    index("human_interview_meeting_status_idx").on(table.organizationId, table.status),
    index("human_interview_meeting_recording_status_idx").on(
      table.organizationId,
      table.recordingStatus,
    ),
    uniqueIndex("human_interview_meeting_id_org_uq").on(table.id, table.organizationId),
    uniqueIndex("human_interview_meeting_livekit_room_idx").on(table.liveKitRoomName),
    index("human_interview_meeting_feishu_meeting_idx").on(
      table.feishuProviderId,
      table.feishuMeetingId,
    ),
    check("human_interview_meeting_schedule_version_check", sql`${table.scheduleVersion} > 0`),
    check(
      "human_interview_meeting_recording_status_check",
      sql`${table.recordingStatus} in ('pending', 'starting', 'active', 'completed', 'failed')`,
    ),
    check(
      "human_interview_meeting_candidate_recording_status_check",
      sql`${table.candidateRecordingStatus} in ('pending', 'starting', 'active', 'completed', 'failed')`,
    ),
  ],
);

// 真人会议回调收据：以提供方事件身份去重，防止重复或迟到回调回退会议状态。
export const humanInterviewMeetingEvent = pgTable(
  "human_interview_meeting_event",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    id: text("id").primaryKey(),
    meetingId: text("meeting_id").notNull(),
    // 复制时由所属会议、轮次或任务回填，数据库禁止跨工作区拼接关联。
    organizationId: text("organization_id").notNull(),
    provider: text("provider").$type<HumanInterviewMeetingProvider>().notNull(),
    providerEventId: text("provider_event_id").notNull(),
    type: text("type").notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.meetingId, table.organizationId],
      foreignColumns: [humanInterviewMeeting.id, humanInterviewMeeting.organizationId],
      name: "human_interview_meeting_event_meeting_id_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "human_interview_meeting_event_organization_id_fk",
    }).onDelete("cascade"),
    index("human_interview_meeting_event_meeting_idx").on(table.meetingId),
    uniqueIndex("human_interview_meeting_event_provider_event_idx").on(
      table.provider,
      table.providerEventId,
    ),
  ],
);

// 真人会议与轮次关联：保留每位候选人的邀请 token、响应和入离会时间。
export const humanInterviewMeetingRound = pgTable(
  "human_interview_meeting_round",
  {
    candidateDeclineReason: text("candidate_decline_reason"),
    candidateInviteExpiresAt: timestamp("candidate_invite_expires_at", { withTimezone: true }),
    candidateInviteStatus: text("candidate_invite_status")
      .$type<CandidateInterviewInvitationStatus>()
      .notNull()
      .default("pending"),
    candidateInviteTokenHash: text("candidate_invite_token_hash"),
    candidateRespondedAt: timestamp("candidate_responded_at", { withTimezone: true }),
    invitationVersion: integer("invitation_version").notNull().default(1),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
    meetingId: text("meeting_id").notNull(),
    // 复制时由所属会议、轮次或任务回填，数据库禁止跨工作区拼接关联。
    organizationId: text("organization_id").notNull(),
    roundId: text("round_id").notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.meetingId, table.organizationId],
      foreignColumns: [humanInterviewMeeting.id, humanInterviewMeeting.organizationId],
      name: "human_interview_meeting_round_meeting_id_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.roundId, table.organizationId],
      foreignColumns: [humanInterviewRound.id, humanInterviewRound.organizationId],
      name: "human_interview_meeting_round_round_id_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "human_interview_meeting_round_organization_id_fk",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.meetingId, table.roundId] }),
    index("human_interview_meeting_round_round_idx").on(table.roundId),
    uniqueIndex("human_interview_meeting_round_invite_token_idx").on(
      table.candidateInviteTokenHash,
    ),
    check(
      "human_interview_meeting_round_invite_status_check",
      sql`${table.candidateInviteStatus} IN ('pending', 'sent', 'accepted', 'declined', 'expired')`,
    ),
    check(
      "human_interview_meeting_round_invitation_version_check",
      sql`${table.invitationVersion} > 0`,
    ),
  ],
);

// 真人会议面试官：保留会议角色、邀请身份与现场转写草稿。
export const humanInterviewMeetingInterviewer = pgTable(
  "human_interview_meeting_interviewer",
  {
    feishuOpenId: text("feishu_open_id"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
    liveTranscriptDraft: jsonb("live_transcript_draft").$type<MeetingLiveTranscriptDraftRecord>(),
    liveTranscriptDraftVersion: integer("live_transcript_draft_version").notNull().default(0),
    meetingId: text("meeting_id").notNull(),
    // 复制时由所属会议、轮次或任务回填，数据库禁止跨工作区拼接关联。
    organizationId: text("organization_id").notNull(),
    role: text("role")
      .$type<HumanInterviewMeetingInterviewerRole>()
      .notNull()
      .default("interviewer"),
    userId: text("user_id").notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "human_interview_meeting_interviewer_user_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.meetingId, table.organizationId],
      foreignColumns: [humanInterviewMeeting.id, humanInterviewMeeting.organizationId],
      name: "human_interview_meeting_interviewer_meeting_id_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "human_interview_meeting_interviewer_organization_id_fk",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.meetingId, table.userId] }),
    index("human_interview_meeting_interviewer_user_idx").on(table.userId),
    check(
      "human_interview_meeting_interviewer_draft_version_check",
      sql`${table.liveTranscriptDraftVersion} >= 0`,
    ),
  ],
);

// 真人轮次面试官：保留分配状态与确认的排期版本，不与会议角色混用。
export const humanInterviewRoundInterviewer = pgTable(
  "human_interview_round_interviewer",
  {
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedScheduleVersion: integer("confirmed_schedule_version"),
    declineReason: text("decline_reason"),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    // 复制时由所属会议、轮次或任务回填，数据库禁止跨工作区拼接关联。
    organizationId: text("organization_id").notNull(),
    roundId: text("round_id").notNull(),
    status: text("status").$type<HumanInterviewerAssignmentStatus>().notNull().default("pending"),
    userId: text("user_id").notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "human_interview_round_interviewer_user_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.roundId, table.organizationId],
      foreignColumns: [humanInterviewRound.id, humanInterviewRound.organizationId],
      name: "human_interview_round_interviewer_round_id_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "human_interview_round_interviewer_organization_id_fk",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.roundId, table.userId] }),
    index("human_interview_round_interviewer_user_idx").on(table.userId),
    check(
      "human_interview_round_interviewer_status_check",
      sql`${table.status} IN ('pending', 'confirmed', 'declined')`,
    ),
    check(
      "human_interview_round_interviewer_confirmed_version_check",
      sql`${table.confirmedScheduleVersion} IS NULL OR ${table.confirmedScheduleVersion} > 0`,
    ),
  ],
);

// 薪资和 Offer 版本：同一招聘可有多版，接受 Offer 只代表进入后续办理，不能直接标记入职。
export const recruitingOffer = pgTable(
  "recruiting_offer",
  {
    baseSalary: integer("base_salary").notNull(),
    bonus: integer("bonus"),
    candidateCounter: text("candidate_counter"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    currency: text("currency").notNull().default("CNY"),
    equity: text("equity"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    id: text("id").primaryKey(),
    joiningDate: timestamp("joining_date", { withTimezone: true }),
    notes: text("notes"),
    organizationId: text("organization_id").notNull(),
    position: text("position").notNull(),
    recruitingRecordId: text("recruiting_record_id").notNull(),
    responseAt: timestamp("response_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    status: text("status").$type<OfferDraftStatus>().notNull().default("draft"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    version: integer("version").notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    check(
      "recruiting_offer_status_check",
      sql`${table.status} IN ('draft','sent','accepted','declined','expired','superseded')`,
    ),
    check(
      "recruiting_offer_salary_check",
      sql`${table.baseSalary} >= 0 AND (${table.bonus} IS NULL OR ${table.bonus} >= 0)`,
    ),
    check("recruiting_offer_version_check", sql`${table.version} > 0`),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "recruiting_offer_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "recruiting_offer_recruiting_record_id_org_fk",
    }).onDelete("cascade"),
    uniqueIndex("recruiting_offer_id_record_org_uq").on(
      table.id,
      table.recruitingRecordId,
      table.organizationId,
    ),
    uniqueIndex("recruiting_offer_record_version_uniq").on(table.recruitingRecordId, table.version),
    index("recruiting_offer_org_idx").on(table.organizationId),
    index("recruiting_offer_status_idx").on(table.status),
  ],
);

// 人才池导入关系：普通导入复用由业务锁保证；显式重新导入允许另一条招聘记录。
export const recruitingPoolImport = pgTable(
  "recruiting_pool_import",
  {
    id: text("id").primaryKey(),
    importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
    importedBy: text("imported_by"),
    organizationId: text("organization_id").notNull(),
    poolItemId: text("pool_item_id").notNull(),
    recruitingRecordId: text("recruiting_record_id").notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.importedBy],
      foreignColumns: [user.id],
      name: "recruiting_pool_import_imported_by_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "recruiting_pool_import_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.poolItemId],
      foreignColumns: [resumePoolItem.id],
      name: "recruiting_pool_import_pool_item_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "recruiting_pool_import_recruiting_record_id_org_fk",
    }).onDelete("cascade"),
    uniqueIndex("recruiting_pool_import_pool_org_record_uq").on(
      table.poolItemId,
      table.organizationId,
      table.recruitingRecordId,
    ),
    index("recruiting_pool_import_pool_org_idx").on(table.poolItemId, table.organizationId),
    index("recruiting_pool_import_record_idx").on(table.recruitingRecordId),
  ],
);

// 招聘上传批次：与旧批次独立保存处理计数和状态，避免新 Worker 回写旧批次。
export const recruitingUploadBatch = pgTable(
  "recruiting_upload_batch",
  {
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").notNull(),
    dedupPolicy: text("dedup_policy").$type<ResumeUploadBatchDedupPolicy>().notNull(),
    failedCount: integer("failed_count").notNull().default(0),
    id: text("id").primaryKey(),
    jdMode: text("jd_mode").$type<ResumeUploadBatchJdMode>().notNull(),
    jobDescriptionId: text("job_description_id"),
    jobMatchRequestedAt: timestamp("job_match_requested_at", { withTimezone: true }),
    organizationId: text("organization_id").notNull(),
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
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [user.id],
      name: "recruiting_upload_batch_created_by_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.jobDescriptionId],
      foreignColumns: [jobDescription.id],
      name: "recruiting_upload_batch_job_description_id_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "recruiting_upload_batch_organization_id_fk",
    }).onDelete("cascade"),
    uniqueIndex("recruiting_upload_batch_id_org_uq").on(table.id, table.organizationId),
    index("recruiting_upload_batch_org_user_status_idx").on(
      table.organizationId,
      table.createdBy,
      table.status,
    ),
    index("recruiting_upload_batch_org_user_created_idx").on(
      table.organizationId,
      table.createdBy,
      table.createdAt,
    ),
  ],
);

// 招聘上传明细：可先关联待解析的新招聘记录，再由 Worker 填充简历；保留原队列任务身份。
export const recruitingUploadBatchItem = pgTable(
  "recruiting_upload_batch_item",
  {
    attemptCount: integer("attempt_count").notNull().default(0),
    batchId: text("batch_id").notNull(),
    contentHash: text("content_hash"),
    dedupMatchSnapshot: jsonb("dedup_match_snapshot"),
    errorMessage: text("error_message"),
    fileSize: integer("file_size").notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    id: text("id").primaryKey(),
    orderIndex: integer("order_index").notNull(),
    organizationId: text("organization_id").notNull(),
    originalFileName: text("original_file_name").notNull(),
    poolItemId: text("pool_item_id"),
    queueJobId: text("queue_job_id"),
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    recruitingRecordId: text("recruiting_record_id"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    status: text("status").$type<ResumeUploadBatchItemStatus>().notNull(),
    storageKey: text("storage_key").notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.poolItemId],
      foreignColumns: [resumePoolItem.id],
      name: "recruiting_upload_batch_item_pool_item_id_fk",
    }).onDelete("set null"),
    uniqueIndex("recruiting_upload_batch_item_id_org_uq").on(table.id, table.organizationId),
    foreignKey({
      columns: [table.batchId, table.organizationId],
      foreignColumns: [recruitingUploadBatch.id, recruitingUploadBatch.organizationId],
      name: "recruiting_upload_batch_item_batch_id_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "recruiting_upload_batch_item_recruiting_record_id_org_fk",
    }).onDelete("no action"),
    index("recruiting_upload_batch_item_batch_order_idx").on(table.batchId, table.orderIndex),
    index("recruiting_upload_batch_item_batch_status_idx").on(table.batchId, table.status),
  ],
);

// 招聘邮件收件记录：连接新上传批次，复用独立邮箱配置，保留邮件去重身份。
export const recruitingMailMessage = pgTable(
  "recruiting_mail_message",
  {
    accountId: text("account_id").notNull(),
    attachmentCount: integer("attachment_count"),
    batchId: text("batch_id"),
    boundJobDescriptionId: text("bound_job_description_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    errorMessage: text("error_message"),
    extractedJobCodes: jsonb("extracted_job_codes").$type<string[]>(),
    fromAddress: text("from_address"),
    id: text("id").primaryKey(),
    jdBindStatus: text("jd_bind_status").$type<MailIngestJdBindStatus>(),
    mailbox: text("mailbox").notNull(),
    messageId: text("message_id"),
    // 复制时由所属会议、轮次或任务回填，数据库禁止跨工作区拼接关联。
    organizationId: text("organization_id").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    resumeAttachmentCount: integer("resume_attachment_count"),
    skipReason: text("skip_reason").$type<MailIngestSkipReason>(),
    status: text("status").$type<MailIngestMessageStatus>().notNull(),
    subject: text("subject"),
    uid: text("uid").notNull(),
    uidValidity: text("uid_validity").notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.accountId],
      foreignColumns: [mailIngestAccount.id],
      name: "recruiting_mail_message_account_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.boundJobDescriptionId],
      foreignColumns: [jobDescription.id],
      name: "recruiting_mail_message_bound_job_description_id_fk",
    }).onDelete("set null"),
    uniqueIndex("recruiting_mail_message_id_org_uq").on(table.id, table.organizationId),
    foreignKey({
      columns: [table.batchId, table.organizationId],
      foreignColumns: [recruitingUploadBatch.id, recruitingUploadBatch.organizationId],
      name: "recruiting_mail_message_batch_id_org_fk",
    }).onDelete("no action"),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "recruiting_mail_message_organization_id_fk",
    }).onDelete("cascade"),
    uniqueIndex("recruiting_mail_message_account_mail_uid_uq").on(
      table.accountId,
      table.mailbox,
      table.uidValidity,
      table.uid,
    ),
    index("recruiting_mail_message_account_status_created_idx").on(
      table.accountId,
      table.status,
      table.createdAt,
    ),
    index("recruiting_mail_message_batch_idx").on(table.batchId),
    index("recruiting_mail_message_account_received_idx").on(
      table.accountId,
      table.receivedAt.desc(),
    ),
  ],
);

// 招聘岗位匹配尝试：关联新上传明细及邮件，保留输入版本与最终选岗依据。
export const recruitingJobMatchRun = pgTable(
  "recruiting_job_match_run",
  {
    batchItemId: text("batch_item_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    errorMessage: text("error_message"),
    id: text("id").primaryKey(),
    mailMessageId: text("mail_message_id"),
    matcherVersion: text("matcher_version").notNull(),
    model: text("model"),
    organizationId: text("organization_id").notNull(),
    poolItemId: text("pool_item_id").notNull(),
    promptVersion: text("prompt_version"),
    resumeInputHash: text("resume_input_hash").notNull(),
    selectedJobDescriptionId: text("selected_job_description_id"),
    selectionMethod: text("selection_method").$type<ResumeJobMatchSelectionMethod>(),
    status: text("status").$type<ResumeJobMatchRunStatus>().notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "recruiting_job_match_run_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.poolItemId],
      foreignColumns: [resumePoolItem.id],
      name: "recruiting_job_match_run_pool_item_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.selectedJobDescriptionId],
      foreignColumns: [jobDescription.id],
      name: "recruiting_job_match_run_selected_job_description_id_fk",
    }).onDelete("set null"),
    uniqueIndex("recruiting_job_match_run_id_org_uq").on(table.id, table.organizationId),
    foreignKey({
      columns: [table.batchItemId, table.organizationId],
      foreignColumns: [recruitingUploadBatchItem.id, recruitingUploadBatchItem.organizationId],
      name: "recruiting_job_match_run_batch_item_id_org_fk",
    }).onDelete("no action"),
    foreignKey({
      columns: [table.mailMessageId, table.organizationId],
      foreignColumns: [recruitingMailMessage.id, recruitingMailMessage.organizationId],
      name: "recruiting_job_match_run_mail_message_id_org_fk",
    }).onDelete("no action"),
    uniqueIndex("recruiting_job_match_run_pool_batch_version_uq").on(
      table.poolItemId,
      table.batchItemId,
      table.matcherVersion,
    ),
    index("recruiting_job_match_run_org_pool_created_idx").on(
      table.organizationId,
      table.poolItemId,
      table.createdAt,
    ),
    index("recruiting_job_match_run_selected_job_idx").on(table.selectedJobDescriptionId),
  ],
);

// 岗位匹配候选结果：这是推荐岗位的证据，不是人才身份，也不决定简历合格与否。
export const recruitingJobMatchCandidate = pgTable(
  "recruiting_job_match_candidate",
  {
    aiRank: integer("ai_rank"),
    aiReason: text("ai_reason"),
    aiScore: integer("ai_score"),
    id: text("id").primaryKey(),
    jobDescriptionId: text("job_description_id"),
    jobSnapshot: jsonb("job_snapshot").$type<ResumeJobMatchJobSnapshot>().notNull(),
    // 复制时由所属会议、轮次或任务回填，数据库禁止跨工作区拼接关联。
    organizationId: text("organization_id").notNull(),
    overviewScore: doublePrecision("overview_score"),
    recallRank: integer("recall_rank"),
    recallSource: text("recall_source").$type<ResumeJobMatchRecallSource>().notNull(),
    runId: text("run_id").notNull(),
    skillRoleScore: doublePrecision("skill_role_score"),
    vectorScore: integer("vector_score"),
    workProjectScore: doublePrecision("work_project_score"),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.jobDescriptionId],
      foreignColumns: [jobDescription.id],
      name: "recruiting_job_match_candidate_job_description_id_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.runId, table.organizationId],
      foreignColumns: [recruitingJobMatchRun.id, recruitingJobMatchRun.organizationId],
      name: "recruiting_job_match_candidate_run_id_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "recruiting_job_match_candidate_organization_id_fk",
    }).onDelete("cascade"),
    uniqueIndex("recruiting_job_match_candidate_run_job_uq").on(
      table.runId,
      table.jobDescriptionId,
    ),
    uniqueIndex("recruiting_job_match_candidate_run_ai_rank_uq").on(table.runId, table.aiRank),
    index("recruiting_job_match_candidate_job_idx").on(table.jobDescriptionId),
    check(
      "recruiting_job_match_candidate_ai_score_check",
      sql`${table.aiScore} IS NULL OR (${table.aiScore} >= 0 AND ${table.aiScore} <= 100)`,
    ),
    check(
      "recruiting_job_match_candidate_ai_rank_check",
      sql`${table.aiRank} IS NULL OR ${table.aiRank} > 0`,
    ),
    check(
      "recruiting_job_match_candidate_recall_rank_check",
      sql`${table.recallRank} IS NULL OR ${table.recallRank} > 0`,
    ),
  ],
);

// AI 面试会话：保留转写、录音、报告和重试状态，关联新招聘及新 AI 轮次。
export const aiInterviewConversation = pgTable(
  "ai_interview_conversation",
  {
    agentId: text("agent_id"),
    aiRoundId: text("ai_round_id"),
    callSuccessful: text("call_successful"),
    conversationId: text("conversation_id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    dataCollectionResults: jsonb("data_collection_results")
      .$type<JsonObject>()
      .notNull()
      .default({}),
    dynamicVariables: jsonb("dynamic_variables").$type<JsonObject>().notNull().default({}),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    evaluationCriteriaResults: jsonb("evaluation_criteria_results")
      .$type<JsonObject>()
      .notNull()
      .default({}),
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
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default({}),
    metrics: jsonb("metrics").$type<JsonObject>().notNull().default({}),
    mode: text("mode"),
    organizationId: text("organization_id").notNull(),
    recordingDurationSecs: integer("recording_duration_secs"),
    recordingEgressId: text("recording_egress_id"),
    recordingFileKey: text("recording_file_key"),
    recordingStatus: text("recording_status").$type<InterviewRecordingStatus>(),
    recruitingRecordId: text("recruiting_record_id"),
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
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex("ai_conversation_round_org_uq").on(
      table.conversationId,
      table.aiRoundId,
      table.organizationId,
    ),
    // 轮次、快照等依据必须属于本招聘，不能只检查同工作区。
    foreignKey({
      columns: [table.aiRoundId, table.recruitingRecordId, table.organizationId],
      foreignColumns: [
        aiInterviewRound.id,
        aiInterviewRound.recruitingRecordId,
        aiInterviewRound.organizationId,
      ],
      name: "ai_interview_conversation_ai_round_id_owner_fk",
    }),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "ai_interview_conversation_organization_id_fk",
    }).onDelete("cascade"),
    uniqueIndex("ai_interview_conversation_conversation_id_org_uq").on(
      table.conversationId,
      table.organizationId,
    ),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "ai_interview_conversation_recruiting_record_id_org_fk",
    }).onDelete("no action"),
    foreignKey({
      columns: [table.aiRoundId, table.organizationId],
      foreignColumns: [aiInterviewRound.id, aiInterviewRound.organizationId],
      name: "ai_interview_conversation_ai_round_id_org_fk",
    }).onDelete("no action"),
    index("ai_interview_conversation_record_idx").on(table.recruitingRecordId),
    index("ai_interview_conversation_key_information_status_idx").on(table.keyInformationStatus),
    index("ai_interview_conversation_ai_round_idx").on(table.aiRoundId),
    index("ai_interview_conversation_status_idx").on(table.status),
    index("ai_interview_conversation_summary_status_idx").on(table.summaryStatus),
    index("ai_interview_conversation_updated_at_idx").on(table.updatedAt),
    index("ai_interview_conversation_org_ended_started_idx").on(
      table.organizationId,
      table.endedAt,
      table.startedAt,
    ),
  ],
);

// AI 面试逐条会话内容：保留原会话归属和消息时间，避免合并不同面试轮次。
export const aiInterviewConversationTurn = pgTable(
  "ai_interview_conversation_turn",
  {
    conversationId: text("conversation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    id: text("id").primaryKey(),
    message: text("message").notNull(),
    organizationId: text("organization_id").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    recruitingRecordId: text("recruiting_record_id"),
    role: text("role").$type<InterviewMessageRole>().notNull(),
    source: text("source").notNull().default("client_event"),
    timeInCallSecs: integer("time_in_call_secs"),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "ai_interview_conversation_turn_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.conversationId, table.organizationId],
      foreignColumns: [
        aiInterviewConversation.conversationId,
        aiInterviewConversation.organizationId,
      ],
      name: "ai_interview_conversation_turn_conversation_id_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "ai_interview_conversation_turn_recruiting_record_id_org_fk",
    }).onDelete("no action"),
    index("ai_interview_conversation_turn_conversation_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    index("ai_interview_conversation_turn_record_idx").on(
      table.recruitingRecordId,
      table.createdAt,
    ),
    index("ai_interview_conversation_turn_organization_idx").on(table.organizationId),
  ],
);

// 招聘操作历史：保存旧审计及新状态变化；重新打开前将失效的下游节点依据写入 detail。
export const recruitingEvent = pgTable(
  "recruiting_event",
  {
    action: text("action").notNull(),
    aiRoundId: text("ai_round_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    detail: jsonb("detail").$type<JsonObject>().notNull().default({}),
    fromOutcome: text("from_outcome").$type<CandidateOutcome>(),
    // 普通历史审计可为空；流程事件使用结构化字段支持时间线和转化统计。
    fromStage: text("from_stage").$type<RecruitingStage>(),
    id: text("id").primaryKey(),
    operatorId: text("operator_id"),
    organizationId: text("organization_id").notNull(),
    pipelineVersion: integer("pipeline_version"),
    reasonCode: text("reason_code").$type<RecruitingCloseReason>(),
    recruitingRecordId: text("recruiting_record_id").notNull(),
    toOutcome: text("to_outcome").$type<CandidateOutcome>(),
    toStage: text("to_stage").$type<RecruitingStage>(),
  },
  (table): PgTableExtraConfigValue[] => [
    // 轮次、快照等依据必须属于本招聘，不能只检查同工作区。
    foreignKey({
      columns: [table.aiRoundId, table.recruitingRecordId, table.organizationId],
      foreignColumns: [
        aiInterviewRound.id,
        aiInterviewRound.recruitingRecordId,
        aiInterviewRound.organizationId,
      ],
      name: "recruiting_event_ai_round_id_owner_fk",
    }),
    check(
      "recruiting_event_stage_pair_check",
      sql`(${table.fromStage} IS NULL) = (${table.toStage} IS NULL)`,
    ),
    check(
      "recruiting_event_outcome_pair_check",
      sql`(${table.fromOutcome} IS NULL) = (${table.toOutcome} IS NULL)`,
    ),
    foreignKey({
      columns: [table.operatorId],
      foreignColumns: [user.id],
      name: "recruiting_event_operator_id_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "recruiting_event_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "recruiting_event_recruiting_record_id_org_fk",
    }).onDelete("cascade"),
    uniqueIndex("recruiting_event_record_version_uq")
      .on(table.recruitingRecordId, table.pipelineVersion)
      .where(sql`${table.pipelineVersion} IS NOT NULL`),
    check(
      "recruiting_event_version_check",
      sql`${table.pipelineVersion} IS NULL OR ${table.pipelineVersion} >= 0`,
    ),
    index("recruiting_event_record_idx").on(table.recruitingRecordId),
    index("recruiting_event_created_at_idx").on(table.createdAt),
    index("recruiting_event_organization_idx").on(table.organizationId),
  ],
);

// 招聘通知接收人：保留工作区成员约束，新招聘不再依赖旧主表占位行。
export const recruitingNotificationRecipient = pgTable(
  "recruiting_notification_recipient",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by"),
    organizationId: text("organization_id").notNull(),
    recruitingRecordId: text("recruiting_record_id").notNull(),
    userId: text("user_id").notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [user.id],
      name: "recruiting_notification_recipient_created_by_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "recruiting_notification_recipient_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "recruiting_notification_recipient_user_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "recruiting_notification_recipient_recruiting_record_id_org_fk",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.recruitingRecordId, table.userId] }),
    foreignKey({
      columns: [table.userId, table.organizationId],
      foreignColumns: [member.userId, member.organizationId],
      name: "recruiting_notification_recipient_member_org_fk",
    }).onDelete("cascade"),
    index("recruiting_notification_recipient_user_idx").on(table.organizationId, table.userId),
  ],
);

// 招聘通知事件：保持事件去重键、快照及租约语义；复制历史数据本身不能发送通知。
export const recruitingNotificationEvent = pgTable(
  "recruiting_notification_event",
  {
    actorUserId: text("actor_user_id"),
    aiRoundId: text("ai_round_id"),
    attemptCount: integer("attempt_count").default(0).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    conversationId: text("conversation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    humanMeetingId: text("human_meeting_id"),
    humanRoundId: text("human_round_id"),
    id: text("id").primaryKey(),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    leaseOwner: text("lease_owner"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    organizationId: text("organization_id").notNull(),
    payloadSnapshot: jsonb("payload_snapshot")
      .$type<InterviewNotificationPayloadSnapshot>()
      .notNull(),
    recruitingRecordId: text("recruiting_record_id"),
    scopeType: text("scope_type").$type<InterviewNotificationScopeType>().notNull(),
    status: text("status").$type<InterviewNotificationEventStatus>().notNull().default("pending"),
    type: text("type").$type<InterviewNotificationEventType>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    // 轮次、快照等依据必须属于本招聘，不能只检查同工作区。
    foreignKey({
      columns: [table.humanRoundId, table.recruitingRecordId, table.organizationId],
      foreignColumns: [
        humanInterviewRound.id,
        humanInterviewRound.recruitingRecordId,
        humanInterviewRound.organizationId,
      ],
      name: "recruiting_notification_event_human_round_id_owner_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.aiRoundId, table.recruitingRecordId, table.organizationId],
      foreignColumns: [
        aiInterviewRound.id,
        aiInterviewRound.recruitingRecordId,
        aiInterviewRound.organizationId,
      ],
      name: "recruiting_notification_event_ai_round_id_owner_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.actorUserId],
      foreignColumns: [user.id],
      name: "recruiting_notification_event_actor_user_id_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "recruiting_notification_event_organization_id_fk",
    }).onDelete("cascade"),
    uniqueIndex("recruiting_notification_event_id_org_uq").on(table.id, table.organizationId),
    foreignKey({
      columns: [table.conversationId, table.organizationId],
      foreignColumns: [
        aiInterviewConversation.conversationId,
        aiInterviewConversation.organizationId,
      ],
      name: "recruiting_notification_event_conversation_id_org_fk",
    }).onDelete("no action"),
    foreignKey({
      columns: [table.humanMeetingId, table.organizationId],
      foreignColumns: [humanInterviewMeeting.id, humanInterviewMeeting.organizationId],
      name: "recruiting_notification_event_human_meeting_id_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.humanRoundId, table.organizationId],
      foreignColumns: [humanInterviewRound.id, humanInterviewRound.organizationId],
      name: "recruiting_notification_event_human_round_id_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "recruiting_notification_event_recruiting_record_id_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.aiRoundId, table.organizationId],
      foreignColumns: [aiInterviewRound.id, aiInterviewRound.organizationId],
      name: "recruiting_notification_event_ai_round_id_org_fk",
    }).onDelete("cascade"),
    uniqueIndex("recruiting_notification_event_dedupe_uq").on(table.dedupeKey),
    index("recruiting_notification_event_claim_idx").on(
      table.status,
      table.nextAttemptAt,
      table.availableAt,
    ),
    index("recruiting_notification_event_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("recruiting_notification_event_record_created_idx").on(
      table.recruitingRecordId,
      table.createdAt,
    ),
    index("recruiting_notification_event_meeting_created_idx").on(
      table.humanMeetingId,
      table.createdAt,
    ),
    check(
      "recruiting_notification_event_status_check",
      sql`${table.status} IN ('pending', 'processing', 'completed', 'failed', 'dead', 'cancelled')`,
    ),
    check(
      "recruiting_notification_event_scope_check",
      sql`(
        (${table.scopeType} = 'interview_record' AND ${table.recruitingRecordId} IS NOT NULL)
        OR (${table.scopeType} = 'ai_round' AND ${table.aiRoundId} IS NOT NULL)
        OR (${table.scopeType} = 'human_meeting' AND ${table.humanMeetingId} IS NOT NULL)
      )`,
    ),
    check("recruiting_notification_event_attempt_count_check", sql`${table.attemptCount} >= 0`),
    check(
      "recruiting_notification_event_lease_pair_check",
      sql`(${table.leaseOwner} IS NULL) = (${table.leaseExpiresAt} IS NULL)`,
    ),
  ],
);

// 招聘通知投递：保留外部消息身份、发送结果及未知结果状态，防止历史通知重复投递。
export const recruitingNotificationDelivery = pgTable(
  "recruiting_notification_delivery",
  {
    attemptCount: integer("attempt_count").default(0).notNull(),
    audienceType: text("audience_type").$type<InterviewNotificationAudienceType>(),
    channel: text("channel").$type<InterviewNotificationChannel>(),
    conversationId: text("conversation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    error: text("error"),
    eventId: text("event_id"),
    feishuDocumentId: text("feishu_document_id"),
    feishuDocumentUrl: text("feishu_document_url"),
    feishuMessageId: text("feishu_message_id"),
    id: text("id").primaryKey(),
    lastErrorCode: text("last_error_code"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    leaseOwner: text("lease_owner"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    organizationId: text("organization_id").notNull(),
    providerId: text("provider_id").notNull(),
    providerMessageId: text("provider_message_id"),
    providerRequestKey: text("provider_request_key"),
    recipientAddress: text("recipient_address"),
    recipientDisplayName: text("recipient_display_name"),
    recipientOpenId: text("recipient_open_id").notNull(),
    recipientUserId: text("recipient_user_id"),
    recruitingRecordId: text("recruiting_record_id").notNull(),
    renderedContent: text("rendered_content"),
    renderedSubject: text("rendered_subject"),
    resultUnknownAt: timestamp("result_unknown_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    status: text("status")
      .$type<InterviewNotificationDeliveryStatus>()
      .notNull()
      .default("pending"),
    templateVersionId: text("template_version_id"),
    type: text("type").$type<AgentNotificationType | InterviewNotificationEventType>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "recruiting_notification_delivery_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.recipientUserId],
      foreignColumns: [user.id],
      name: "recruiting_notification_delivery_recipient_user_id_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.templateVersionId],
      foreignColumns: [interviewNotificationTemplateVersion.id],
      name: "recruiting_notification_delivery_template_version_id_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.conversationId, table.organizationId],
      foreignColumns: [
        aiInterviewConversation.conversationId,
        aiInterviewConversation.organizationId,
      ],
      name: "recruiting_notification_delivery_conversation_id_org_fk",
    }).onDelete("no action"),
    foreignKey({
      columns: [table.eventId, table.organizationId],
      foreignColumns: [recruitingNotificationEvent.id, recruitingNotificationEvent.organizationId],
      name: "recruiting_notification_delivery_event_id_org_fk",
    }).onDelete("no action"),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "recruiting_notification_delivery_recruiting_record_id_org_fk",
    }).onDelete("cascade"),
    index("recruiting_notification_delivery_recipient_idx").on(table.recipientUserId),
    index("recruiting_notification_event_idx").on(table.eventId),
    index("recruiting_notification_delivery_delivery_claim_idx").on(
      table.status,
      table.nextAttemptAt,
    ),
    uniqueIndex("recruiting_notification_event_channel_recipient_uq")
      .on(table.eventId, table.channel, table.recipientAddress)
      .where(
        sql`${table.eventId} IS NOT NULL AND ${table.channel} IS NOT NULL AND ${table.recipientAddress} IS NOT NULL`,
      ),
    uniqueIndex("recruiting_notification_delivery_provider_request_uq")
      .on(table.providerRequestKey)
      .where(sql`${table.providerRequestKey} IS NOT NULL`),
    uniqueIndex("recruiting_notification_delivery_once_uq").on(
      table.recruitingRecordId,
      table.conversationId,
      table.type,
      table.recipientUserId,
      table.providerId,
    ),
    index("recruiting_notification_delivery_organization_idx").on(table.organizationId),
    check(
      "recruiting_notification_delivery_delivery_status_check",
      sql`${table.status} IN ('pending', 'sending', 'sent', 'failed', 'dead', 'unknown', 'cancelled')`,
    ),
    check("recruiting_notification_delivery_attempt_count_check", sql`${table.attemptCount} >= 0`),
    check(
      "recruiting_notification_delivery_lease_pair_check",
      sql`(${table.leaseOwner} IS NULL) = (${table.leaseExpiresAt} IS NULL)`,
    ),
  ],
);

// 招聘候选人表单回答：关联新招聘，仍引用原独立表单模板和不可变版本。
export const recruitingFormSubmission = pgTable(
  "recruiting_form_submission",
  {
    answers: jsonb("answers").$type<Record<string, string | string[]>>().notNull().default({}),
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    recruitingRecordId: text("recruiting_record_id").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    templateId: text("template_id").notNull(),
    versionId: text("version_id").notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "recruiting_form_submission_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.templateId],
      foreignColumns: [candidateFormTemplate.id],
      name: "recruiting_form_submission_template_id_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.versionId],
      foreignColumns: [candidateFormTemplateVersion.id],
      name: "recruiting_form_submission_version_id_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "recruiting_form_submission_recruiting_record_id_org_fk",
    }).onDelete("cascade"),
    uniqueIndex("recruiting_form_submission_template_interview_uq").on(
      table.templateId,
      table.recruitingRecordId,
    ),
    index("recruiting_form_submission_version_idx").on(table.versionId),
    index("recruiting_form_submission_interview_idx").on(table.recruitingRecordId),
    index("recruiting_form_submission_organization_idx").on(table.organizationId),
  ],
);

// 招聘问题模板绑定：保留人工禁用和排序设置，模板定义继续复用独立资源。
export const recruitingQuestionTemplateBinding = pgTable(
  "recruiting_question_template_binding",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    disabledByUser: boolean("disabled_by_user").default(false).notNull(),
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    recruitingRecordId: text("recruiting_record_id").notNull(),
    sortOrder: integer("sort_order").notNull(),
    templateId: text("template_id").notNull(),
    versionId: text("version_id").notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "recruiting_question_template_binding_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.templateId],
      foreignColumns: [interviewQuestionTemplate.id],
      name: "recruiting_question_template_binding_template_id_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.versionId],
      foreignColumns: [interviewQuestionTemplateVersion.id],
      name: "recruiting_question_template_binding_version_id_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "recruiting_question_template_binding_recruiting_rec_bc995636",
    }).onDelete("cascade"),
    uniqueIndex("recruiting_question_template_binding_interview_template_uq").on(
      table.recruitingRecordId,
      table.templateId,
    ),
    index("recruiting_question_template_binding_template_idx").on(table.templateId),
    index("recruiting_question_template_binding_version_idx").on(table.versionId),
    index("recruiting_question_template_binding_organization_idx").on(table.organizationId),
  ],
);

// 招聘面试上下文快照：保留当时的问题与配置依据，不用当前配置覆盖历史。
export const recruitingContextSnapshot = pgTable(
  "recruiting_context_snapshot",
  {
    aiRoundId: text("ai_round_id"),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by"),
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    payload: jsonb("payload").$type<InterviewContextSnapshotPayload>().notNull(),
    reason: text("reason").$type<InterviewContextSnapshotReason>().notNull(),
    recruitingRecordId: text("recruiting_record_id").notNull(),
    status: text("status").$type<InterviewSnapshotStatus>().notNull().default("active"),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    version: integer("version").notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    // 轮次、快照等依据必须属于本招聘，不能只检查同工作区。
    foreignKey({
      columns: [table.aiRoundId, table.recruitingRecordId, table.organizationId],
      foreignColumns: [
        aiInterviewRound.id,
        aiInterviewRound.recruitingRecordId,
        aiInterviewRound.organizationId,
      ],
      name: "recruiting_context_snapshot_ai_round_id_owner_fk",
    }),
    uniqueIndex("recruiting_context_snapshot_owner_uq").on(
      table.id,
      table.recruitingRecordId,
      table.organizationId,
    ),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [user.id],
      name: "recruiting_context_snapshot_created_by_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "recruiting_context_snapshot_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "recruiting_context_snapshot_recruiting_record_id_org_fk",
    }).onDelete("cascade"),
    uniqueIndex("recruiting_context_snapshot_record_version_uq").on(
      table.recruitingRecordId,
      table.version,
    ),
    index("recruiting_context_snapshot_record_status_idx").on(
      table.recruitingRecordId,
      table.status,
    ),
    index("recruiting_context_snapshot_round_idx").on(table.aiRoundId),
    index("recruiting_context_snapshot_organization_idx").on(table.organizationId),
  ],
);

// 招聘面试证据快照：关联新上下文、轮次和会话，保留原报告依据。
export const recruitingEvidenceSnapshot = pgTable(
  "recruiting_evidence_snapshot",
  {
    aiRoundId: text("ai_round_id"),
    contentHash: text("content_hash").notNull(),
    contextSnapshotId: text("context_snapshot_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    payload: jsonb("payload").$type<InterviewEvidenceSnapshotPayload>().notNull(),
    recruitingRecordId: text("recruiting_record_id").notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    // 轮次、快照等依据必须属于本招聘，不能只检查同工作区。
    foreignKey({
      columns: [table.contextSnapshotId, table.recruitingRecordId, table.organizationId],
      foreignColumns: [
        recruitingContextSnapshot.id,
        recruitingContextSnapshot.recruitingRecordId,
        recruitingContextSnapshot.organizationId,
      ],
      name: "recruiting_evidence_snapshot_context_snapshot_id_owner_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.aiRoundId, table.recruitingRecordId, table.organizationId],
      foreignColumns: [
        aiInterviewRound.id,
        aiInterviewRound.recruitingRecordId,
        aiInterviewRound.organizationId,
      ],
      name: "recruiting_evidence_snapshot_ai_round_id_owner_fk",
    }),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "recruiting_evidence_snapshot_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.conversationId, table.organizationId],
      foreignColumns: [
        aiInterviewConversation.conversationId,
        aiInterviewConversation.organizationId,
      ],
      name: "recruiting_evidence_snapshot_conversation_id_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "recruiting_evidence_snapshot_recruiting_record_id_org_fk",
    }).onDelete("cascade"),
    uniqueIndex("recruiting_evidence_snapshot_conversation_hash_uq").on(
      table.conversationId,
      table.contentHash,
    ),
    index("recruiting_evidence_snapshot_record_idx").on(table.recruitingRecordId),
    index("recruiting_evidence_snapshot_round_idx").on(table.aiRoundId),
    index("recruiting_evidence_snapshot_context_idx").on(table.contextSnapshotId),
    index("recruiting_evidence_snapshot_organization_idx").on(table.organizationId),
  ],
);

// AI 轮次邮件日志：保留原发送时间与提供方消息 ID，不因复制重新发送邀请。
export const recruitingRoundEmailLog = pgTable(
  "recruiting_round_email_log",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    errorMessage: text("error_message"),
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    recruitingRecordId: text("recruiting_record_id").notNull(),
    resendMessageId: text("resend_message_id"),
    roundId: text("round_id").notNull(),
    sentBy: text("sent_by"),
    status: text("status").$type<StudioRoundEmailLogStatus>().notNull(),
    subject: text("subject").notNull(),
    templateKey: text("template_key").notNull().default("round_invite"),
    toEmail: text("to_email").notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    // 轮次、快照等依据必须属于本招聘，不能只检查同工作区。
    foreignKey({
      columns: [table.roundId, table.recruitingRecordId, table.organizationId],
      foreignColumns: [
        aiInterviewRound.id,
        aiInterviewRound.recruitingRecordId,
        aiInterviewRound.organizationId,
      ],
      name: "recruiting_round_email_log_round_id_owner_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "recruiting_round_email_log_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sentBy],
      foreignColumns: [user.id],
      name: "recruiting_round_email_log_sent_by_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "recruiting_round_email_log_recruiting_record_id_org_fk",
    }).onDelete("cascade"),
    index("recruiting_round_email_log_organization_idx").on(table.organizationId),
    index("recruiting_round_email_log_round_created_idx").on(table.roundId, table.createdAt),
  ],
);

// 会议招聘关联：Desktop 会议指向新招聘记录，同一工作区复合外键保持权限隔离。
export const recruitingMeetingContext = pgTable(
  "recruiting_meeting_context",
  {
    linkedAt: timestamp("linked_at", { withTimezone: true }).defaultNow().notNull(),
    linkedBy: text("linked_by"),
    meetingId: text("meeting_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    recruitingRecordId: text("recruiting_record_id").notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.linkedBy],
      foreignColumns: [user.id],
      name: "recruiting_meeting_context_linked_by_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "recruiting_meeting_context_organization_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.recruitingRecordId, table.organizationId],
      foreignColumns: [recruitingRecord.id, recruitingRecord.organizationId],
      name: "recruiting_meeting_context_recruiting_record_id_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.meetingId, table.organizationId],
      foreignColumns: [meetingSession.id, meetingSession.organizationId],
      name: "recruiting_meeting_context_meeting_org_fk",
    }).onDelete("cascade"),
    index("recruiting_meeting_context_org_record_idx").on(
      table.organizationId,
      table.recruitingRecordId,
    ),
  ],
);

// 招聘语义索引台账：与旧索引状态分离，多态来源 ID 由索引业务校验，不充当身份合并规则。
export const recruitingSearchIndex = pgTable(
  "recruiting_search_index",
  {
    contentHash: text("content_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    embeddingModel: text("embedding_model").notNull(),
    embeddingVersion: text("embedding_version").notNull(),
    errorMessage: text("error_message"),
    id: text("id").primaryKey(),
    lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }),
    organizationId: text("organization_id").notNull(),
    profileHash: text("profile_hash").notNull(),
    sourceId: text("source_id").notNull(),
    sourceType: text("source_type").$type<RecruitingSearchSource>().notNull(),
    status: text("status").$type<ResumeSemanticIndexStatus>().notNull().default("pending"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    check(
      "recruiting_search_source_check",
      sql`${table.sourceType} IN ('resume_pool_item','recruiting_record','job_description')`,
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "recruiting_search_index_organization_id_fk",
    }).onDelete("cascade"),
    uniqueIndex("recruiting_search_index_source_version_uq").on(
      table.sourceType,
      table.sourceId,
      table.embeddingVersion,
    ),
    index("recruiting_search_index_org_status_idx").on(table.organizationId, table.status),
    index("recruiting_search_index_org_source_idx").on(
      table.organizationId,
      table.sourceType,
      table.sourceId,
    ),
  ],
);

// 招聘疑似重复提示：只记录相似性，不自动合并人才或改变招聘记录。
export const recruitingDuplicateMatch = pgTable(
  "recruiting_duplicate_match",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    embeddingVersion: text("embedding_version").notNull(),
    id: text("id").primaryKey(),
    level: text("level").$type<ResumeSemanticDuplicateLevel>().notNull(),
    matchedSourceId: text("matched_source_id").notNull(),
    matchedSourceType: text("matched_source_type").$type<RecruitingSearchSource>().notNull(),
    organizationId: text("organization_id").notNull(),
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
    sourceType: text("source_type").$type<RecruitingSearchSource>().notNull(),
    status: text("status").$type<ResumeDuplicateMatchStatus>().notNull().default("active"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    check(
      "recruiting_duplicate_source_check",
      sql`${table.sourceType} IN ('resume_pool_item','recruiting_record','job_description') AND ${table.matchedSourceType} IN ('resume_pool_item','recruiting_record','job_description')`,
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organization.id],
      name: "recruiting_duplicate_match_organization_id_fk",
    }).onDelete("cascade"),
    uniqueIndex("recruiting_duplicate_match_source_target_version_uq").on(
      table.organizationId,
      table.sourceType,
      table.sourceId,
      table.matchedSourceType,
      table.matchedSourceId,
      table.embeddingVersion,
    ),
    index("recruiting_duplicate_match_org_source_idx").on(
      table.organizationId,
      table.sourceType,
      table.sourceId,
      table.createdAt,
    ),
    index("recruiting_duplicate_match_org_level_idx").on(table.organizationId, table.level),
    index("recruiting_duplicate_match_org_status_idx").on(table.organizationId, table.status),
  ],
);
