import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const localMeetingSession = sqliteTable(
  "local_meeting_session",
  {
    endedAt: text("ended_at"),
    id: text().primaryKey(),
    liveSummary: text("live_summary"),
    liveSummaryCheckpoint: text("live_summary_checkpoint"),
    liveTranscriptDraft: text("live_transcript_draft"),
    recruitingRecordId: text("recruiting_record_id"),
    segmentCount: integer("segment_count").notNull().default(1),
    startedAt: text("started_at").notNull(),
    state: text().notNull(),
    title: text().notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("local_meeting_session_updated_idx").on(table.updatedAt)],
);

export const localMeetingProcessing = sqliteTable("local_meeting_processing", {
  accountId: text("account_id").notNull(),
  audioReleasedAt: integer("audio_released_at"),
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
  inputRevision: text("input_revision").notNull(),
  meetingId: text("meeting_id").primaryKey(),
  resourceMeetingId: text("resource_meeting_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  workspaceSlug: text("workspace_slug").notNull(),
});

export const localMeetingTask = sqliteTable(
  "local_meeting_task",
  {
    attemptToken: text("attempt_token"),
    availableAt: integer("available_at").notNull(),
    checkpoint: text(),
    createdAt: integer("created_at").notNull(),
    error: text(),
    id: text().primaryKey(),
    inputRevision: text("input_revision").notNull(),
    kind: text().notNull(),
    leaseUntil: integer("lease_until"),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => localMeetingProcessing.meetingId),
    output: text(),
    retryCount: integer("retry_count").notNull().default(0),
    state: text().notNull().default("ready"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("local_meeting_task_ready_idx").on(table.state, table.availableAt)],
);

export const localMeetingTaskDependency = sqliteTable(
  "local_meeting_task_dependency",
  {
    dependencyId: text("dependency_id")
      .notNull()
      .references(() => localMeetingTask.id),
    taskId: text("task_id")
      .notNull()
      .references(() => localMeetingTask.id),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.dependencyId] })],
);
