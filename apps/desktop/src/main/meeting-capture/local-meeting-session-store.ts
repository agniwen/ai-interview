import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { DesktopDatabase } from "../database";
import type {
  LocalMeetingSession,
  LocalMeetingSessionCreateInput,
} from "../../preload/local-meeting-session";
import { meetingLiveTranscriptDraftSchema } from "@app/shared/meeting-transcription";

interface LocalMeetingSessionStoreOptions {
  migrationsFolder?: string;
  now?: () => Date;
}

interface SessionRow {
  ended_at: string | null;
  id: string;
  live_transcript_draft: string | null;
  recruiting_record_id: string | null;
  segment_count: number;
  started_at: string;
  state: LocalMeetingSession["state"];
  title: string;
  updated_at: string;
}

const sessionRowSchema = z.object({
  ended_at: z.string().nullable(),
  id: z.string(),
  live_transcript_draft: z.string().nullable(),
  recruiting_record_id: z.string().nullable(),
  segment_count: z.number(),
  started_at: z.string(),
  state: z.enum([
    "recording",
    "paused",
    "interrupted",
    "finalizing-local",
    "saved-local",
    "uploading",
    "workspace-verified",
    "sync-failed",
  ]),
  title: z.string(),
  updated_at: z.string(),
});

function fromRow(row: SessionRow): LocalMeetingSession {
  const parsedDraft = row.live_transcript_draft
    ? meetingLiveTranscriptDraftSchema.parse(JSON.parse(row.live_transcript_draft))
    : null;
  return {
    endedAt: row.ended_at,
    id: row.id,
    liveTranscriptDraft: parsedDraft,
    recruitingRecordId: row.recruiting_record_id,
    segmentCount: row.segment_count,
    startedAt: row.started_at,
    state: row.state,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

/** Durable local session index. Audio bytes remain in the filesystem spool. */
export class LocalMeetingSessionStore {
  private readonly database: DesktopDatabase;
  private readonly ownsDatabase: boolean;
  private readonly now: () => Date;

  readonly path: string;

  constructor(
    databaseOrPath: DesktopDatabase | string,
    options: LocalMeetingSessionStoreOptions = {},
  ) {
    const suppliedDatabase = databaseOrPath instanceof DesktopDatabase ? databaseOrPath : null;
    const path = suppliedDatabase?.path ?? z.string().parse(databaseOrPath);
    mkdirSync(dirname(path), { mode: 0o700, recursive: true });
    this.path = path;
    this.now = options.now ?? (() => new Date());
    this.ownsDatabase = suppliedDatabase === null;
    this.database =
      suppliedDatabase ??
      new DesktopDatabase({
        migrationsFolder: options.migrationsFolder ?? join(process.cwd(), "drizzle-local"),
        path,
      });
  }

  acknowledgeRemoteVisibility(id: string): void {
    this.database.sqlite
      .prepare("DELETE FROM local_meeting_session WHERE id = ? AND state = 'workspace-verified'")
      .run(id);
  }

  close(): void {
    if (this.ownsDatabase) {
      this.database.close();
    }
  }

  create(input: LocalMeetingSessionCreateInput): LocalMeetingSession {
    const updatedAt = this.now().toISOString();
    this.database.sqlite
      .prepare(`
        INSERT INTO local_meeting_session (
          id, recruiting_record_id, title, state, started_at, segment_count, updated_at
        ) VALUES (?, ?, ?, 'recording', ?, 1, ?)
        ON CONFLICT(id) DO NOTHING
      `)
      .run(input.id, input.recruitingRecordId, input.title, input.startedAt, updatedAt);
    const session = this.get(input.id);
    if (!session) {
      throw new Error("本地 Meeting Session 创建失败");
    }
    return session;
  }

  delete(id: string): void {
    this.database.sqlite.prepare("DELETE FROM local_meeting_session WHERE id = ?").run(id);
  }

  get(id: string): LocalMeetingSession | null {
    const row = sessionRowSchema.safeParse(
      this.database.sqlite.prepare("SELECT * FROM local_meeting_session WHERE id = ?").get(id),
    );
    return row.success ? fromRow(row.data) : null;
  }

  list(): LocalMeetingSession[] {
    const rows = sessionRowSchema
      .array()
      .parse(
        this.database.sqlite
          .prepare("SELECT * FROM local_meeting_session ORDER BY updated_at DESC")
          .all(),
      );
    return rows.map(fromRow);
  }

  update(
    id: string,
    patch: Partial<
      Pick<
        LocalMeetingSession,
        "endedAt" | "liveTranscriptDraft" | "segmentCount" | "state" | "title"
      >
    >,
  ): LocalMeetingSession {
    const current = this.get(id);
    if (!current) {
      throw new Error("本地 Meeting Session 不存在");
    }
    const next = { ...current, ...patch, updatedAt: this.now().toISOString() };
    this.database.sqlite
      .prepare(`
        UPDATE local_meeting_session
        SET title = ?, state = ?, ended_at = ?, segment_count = ?,
            live_transcript_draft = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        next.title,
        next.state,
        next.endedAt,
        next.segmentCount,
        next.liveTranscriptDraft ? JSON.stringify(next.liveTranscriptDraft) : null,
        next.updatedAt,
        id,
      );
    return next;
  }
}
