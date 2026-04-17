/* oxlint-disable no-inline-comments -- `/* @__PURE__ *\/` is a bundler annotation, not a human comment. */

import type { InterviewTranscriptTurn } from "@/lib/interview-session";
import type { InterviewQuestion, ResumeProfile } from "@/lib/interview/types";
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
    notes: text("notes"),
    resumeFileName: text("resume_file_name"),
    resumeProfile: jsonb("resume_profile").$type<ResumeProfile | null>(),
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
