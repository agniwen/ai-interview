import type { InterviewQuestion, ResumeProfile } from '@/lib/interview/types';
import type { StudioInterviewStatus } from '@/lib/studio-interviews';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  role: text('role').default('user').notNull(),
  banned: boolean('banned').default(false).notNull(),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    impersonatedBy: text('impersonated_by'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  table => [index('session_userId_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  table => [index('account_userId_idx').on(table.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  table => [index('verification_identifier_idx').on(table.identifier)],
);

export const studioInterview = pgTable(
  'studio_interview',
  {
    id: text('id').primaryKey(),
    candidateName: text('candidate_name').notNull(),
    candidateEmail: text('candidate_email'),
    targetRole: text('target_role'),
    status: text('status').$type<StudioInterviewStatus>().notNull(),
    resumeFileName: text('resume_file_name'),
    resumeProfile: jsonb('resume_profile').$type<ResumeProfile | null>(),
    interviewQuestions: jsonb('interview_questions').$type<InterviewQuestion[]>().notNull().default([]),
    notes: text('notes'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  table => [
    index('studio_interview_status_idx').on(table.status),
    index('studio_interview_created_at_idx').on(table.createdAt),
    index('studio_interview_created_by_idx').on(table.createdBy),
  ],
);

export const studioInterviewSchedule = pgTable(
  'studio_interview_schedule',
  {
    id: text('id').primaryKey(),
    interviewRecordId: text('interview_record_id')
      .notNull()
      .references(() => studioInterview.id, { onDelete: 'cascade' }),
    roundLabel: text('round_label').notNull(),
    scheduledAt: timestamp('scheduled_at'),
    notes: text('notes'),
    sortOrder: integer('sort_order').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  table => [
    index('studio_interview_schedule_record_idx').on(table.interviewRecordId),
    index('studio_interview_schedule_sort_idx').on(table.interviewRecordId, table.sortOrder),
  ],
);

export const interviewConversation = pgTable(
  'interview_conversation',
  {
    conversationId: text('conversation_id').primaryKey(),
    interviewRecordId: text('interview_record_id').references(() => studioInterview.id, { onDelete: 'set null' }),
    agentId: text('agent_id'),
    status: text('status').notNull().default('initiated'),
    mode: text('mode'),
    transcript: jsonb('transcript').$type<import('@/lib/interview-session').InterviewTranscriptTurn[]>().notNull().default([]),
    transcriptSummary: text('transcript_summary'),
    callSuccessful: text('call_successful'),
    evaluationCriteriaResults: jsonb('evaluation_criteria_results').$type<Record<string, unknown>>().notNull().default({}),
    dataCollectionResults: jsonb('data_collection_results').$type<Record<string, unknown>>().notNull().default({}),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    dynamicVariables: jsonb('dynamic_variables').$type<Record<string, unknown>>().notNull().default({}),
    latestError: text('latest_error'),
    startedAt: timestamp('started_at'),
    endedAt: timestamp('ended_at'),
    webhookReceivedAt: timestamp('webhook_received_at'),
    lastSyncedAt: timestamp('last_synced_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  table => [
    index('interview_conversation_record_idx').on(table.interviewRecordId),
    index('interview_conversation_status_idx').on(table.status),
    index('interview_conversation_updated_at_idx').on(table.updatedAt),
  ],
);

export const interviewConversationTurn = pgTable(
  'interview_conversation_turn',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => interviewConversation.conversationId, { onDelete: 'cascade' }),
    interviewRecordId: text('interview_record_id').references(() => studioInterview.id, { onDelete: 'set null' }),
    role: text('role').$type<'agent' | 'user'>().notNull(),
    message: text('message').notNull(),
    source: text('source').notNull().default('client_event'),
    timeInCallSecs: integer('time_in_call_secs'),
    createdAt: timestamp('created_at').notNull(),
    receivedAt: timestamp('received_at').defaultNow().notNull(),
  },
  table => [
    index('interview_conversation_turn_conversation_idx').on(table.conversationId, table.createdAt),
    index('interview_conversation_turn_record_idx').on(table.interviewRecordId, table.createdAt),
  ],
);
