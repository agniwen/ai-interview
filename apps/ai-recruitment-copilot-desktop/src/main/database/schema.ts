import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const localMeetingSession = sqliteTable(
  "local_meeting_session",
  {
    endedAt: text("ended_at"),
    id: text().primaryKey(),
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
