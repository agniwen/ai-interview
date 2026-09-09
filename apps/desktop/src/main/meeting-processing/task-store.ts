import type { JsonValue } from "@app/db-schema/json";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { DesktopDatabase } from "../database";

const taskSchema = z.object({
  attempt_token: z.string().nullable(),
  available_at: z.number(),
  checkpoint: z.string().nullable(),
  created_at: z.number(),
  error: z.string().nullable(),
  id: z.string(),
  input_revision: z.string(),
  kind: z.string(),
  lease_until: z.number().nullable(),
  meeting_id: z.string(),
  output: z.string().nullable(),
  retry_count: z.number(),
  state: z.enum(["ready", "running", "paused", "succeeded", "failed", "cancelled"]),
  updated_at: z.number(),
});

const bindingSchema = z.object({
  account_id: z.string(),
  audio_released_at: z.number().nullable(),
  created_at: z.number(),
  deleted_at: z.number().nullable(),
  input_revision: z.string(),
  meeting_id: z.string(),
  resource_meeting_id: z.string(),
  workspace_id: z.string(),
  workspace_slug: z.string(),
});

export type LocalProcessingTask = z.infer<typeof taskSchema>;
export type LocalProcessingBinding = z.infer<typeof bindingSchema>;
export type TaskFailureKind = "transient" | "offline" | "authorization" | "quota" | "invalid";
export interface ProcessingBindingInput {
  resourceMeetingId?: string;
  accountId: string;
  workspaceId: string;
  workspaceSlug: string;
  meetingId: string;
  inputRevision: string;
}
export interface ProcessingStep {
  checkpoint?: JsonValue;
  kind: string;
  dependencies: string[];
}

const LEASE_MS = 120_000;
const RETRY_LIMIT = 5;

/** SQLite owns progress and results. Attempt tokens fence every checkpoint and completion. */
export class MeetingTaskStore {
  private readonly database: DesktopDatabase;
  private readonly now: () => number;

  constructor(database: DesktopDatabase, now: () => number = Date.now) {
    this.database = database;
    this.now = now;
  }

  private transaction<T>(operation: () => T): T {
    this.database.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.database.sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  bind(input: ProcessingBindingInput, steps: ProcessingStep[]): void {
    this.transaction(() => {
      const existing = this.binding(input.meetingId);
      if (
        existing &&
        (existing.deleted_at !== null ||
          existing.account_id !== input.accountId ||
          existing.resource_meeting_id !== (input.resourceMeetingId ?? input.meetingId) ||
          existing.workspace_id !== input.workspaceId ||
          existing.input_revision !== input.inputRevision)
      ) {
        throw new Error("本地任务已绑定其他所有者、版本或已删除");
      }
      const now = this.now();
      this.database.sqlite
        .prepare(`
        INSERT INTO local_meeting_processing
          (meeting_id, account_id, resource_meeting_id, workspace_id, workspace_slug, input_revision, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(meeting_id) DO NOTHING
      `)
        .run(
          input.meetingId,
          input.accountId,
          input.resourceMeetingId ?? input.meetingId,
          input.workspaceId,
          input.workspaceSlug,
          input.inputRevision,
          now,
        );
      const seen = new Set<string>();
      for (const step of steps) {
        if (seen.has(step.kind) || step.dependencies.some((kind) => !seen.has(kind))) {
          throw new Error("任务依赖必须按顺序声明且不能形成环");
        }
        seen.add(step.kind);
        const id = MeetingTaskStore.taskId(input, step.kind);
        this.database.sqlite
          .prepare(`
          INSERT INTO local_meeting_task
            (id, meeting_id, input_revision, kind, checkpoint, available_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING
        `)
          .run(
            id,
            input.meetingId,
            input.inputRevision,
            step.kind,
            step.checkpoint === undefined ? null : JSON.stringify(step.checkpoint),
            now,
            now,
            now,
          );
        for (const dependency of step.dependencies) {
          this.database.sqlite
            .prepare(`
            INSERT INTO local_meeting_task_dependency (task_id, dependency_id)
            VALUES (?, ?) ON CONFLICT DO NOTHING
          `)
            .run(id, MeetingTaskStore.taskId(input, dependency));
        }
      }
    });
  }

  seal(meetingId: string, inputRevision: string, steps: ProcessingStep[]): void {
    this.transaction(() => {
      const binding = this.binding(meetingId);
      if (!binding || binding.deleted_at !== null) {
        throw new Error("此录音尚未绑定处理设备，请在此设备继续处理");
      }
      if (binding.input_revision !== "" && binding.input_revision !== inputRevision) {
        throw new Error("本地录音版本已变化");
      }
      this.database.sqlite
        .prepare(
          "UPDATE local_meeting_processing SET input_revision = ? WHERE meeting_id = ? AND input_revision = ''",
        )
        .run(inputRevision, meetingId);
    });
    const binding = this.binding(meetingId);
    if (!binding) {
      throw new Error("本地任务所有者缺失");
    }
    this.bind(
      {
        accountId: binding.account_id,
        inputRevision,
        meetingId,
        workspaceId: binding.workspace_id,
        workspaceSlug: binding.workspace_slug,
      },
      steps,
    );
  }

  private static taskId(input: ProcessingBindingInput, kind: string): string {
    return JSON.stringify([input.meetingId, input.inputRevision, kind]);
  }

  binding(meetingId: string): LocalProcessingBinding | null {
    const row = this.database.sqlite
      .prepare("SELECT * FROM local_meeting_processing WHERE meeting_id = ?")
      .get(meetingId);
    return row ? bindingSchema.parse(row) : null;
  }

  bindings(): LocalProcessingBinding[] {
    return bindingSchema
      .array()
      .parse(this.database.sqlite.prepare("SELECT * FROM local_meeting_processing").all());
  }

  authorizeAudioRelease(meetingId: string): void {
    this.transaction(() => {
      const tasks = this.list(meetingId);
      if (tasks.length === 0 || tasks.some((task) => task.state !== "succeeded")) {
        throw new Error("录音尚未完成处理和云端校验，不能释放本地音频");
      }
      this.database.sqlite
        .prepare(
          "UPDATE local_meeting_processing SET audio_released_at = ? WHERE meeting_id = ? AND deleted_at IS NULL",
        )
        .run(this.now(), meetingId);
    });
  }

  list(meetingId: string): LocalProcessingTask[] {
    return taskSchema
      .array()
      .parse(
        this.database.sqlite
          .prepare(
            "SELECT * FROM local_meeting_task WHERE meeting_id = ? ORDER BY created_at, rowid",
          )
          .all(meetingId),
      );
  }

  claim(kinds: string[]): LocalProcessingTask | null {
    if (kinds.length === 0) {
      return null;
    }
    return this.transaction(() => {
      this.recoverExpired();
      const now = this.now();
      const row = this.database.sqlite
        .prepare(`
        UPDATE local_meeting_task SET state = 'running', attempt_token = ?, lease_until = ?, updated_at = ?
        WHERE id = (
          SELECT task.id FROM local_meeting_task task
          JOIN local_meeting_processing binding ON binding.meeting_id = task.meeting_id
          WHERE task.state = 'ready' AND task.available_at <= ?
            AND task.kind IN (${kinds.map(() => "?").join(",")})
            AND (binding.deleted_at IS NULL OR task.kind = 'purge') AND binding.input_revision = task.input_revision
            AND NOT EXISTS (
              SELECT 1 FROM local_meeting_task_dependency edge
              JOIN local_meeting_task dependency ON dependency.id = edge.dependency_id
              WHERE edge.task_id = task.id AND dependency.state <> 'succeeded'
            )
          ORDER BY task.available_at, task.rowid LIMIT 1
        ) RETURNING *
      `)
        .get(randomUUID(), now + LEASE_MS, now, now, ...kinds);
      return row ? taskSchema.parse(row) : null;
    });
  }

  checkpoint(task: LocalProcessingTask, value: JsonValue): boolean {
    return this.updateAttempt(task, "checkpoint = ?, lease_until = ?", [
      JSON.stringify(value),
      this.now() + LEASE_MS,
    ]);
  }

  renew(task: LocalProcessingTask): boolean {
    return this.updateAttempt(task, "lease_until = ?", [this.now() + LEASE_MS]);
  }

  complete(task: LocalProcessingTask, output: JsonValue): boolean {
    // Output and completion commit together; successful provider data survives app restart.
    return this.updateAttempt(
      task,
      "state = 'succeeded', output = ?, attempt_token = NULL, lease_until = NULL, error = NULL",
      [JSON.stringify(output)],
    );
  }

  fail(task: LocalProcessingTask, kind: TaskFailureKind, message: string): boolean {
    if (kind === "offline") {
      return this.updateAttempt(
        task,
        "state = 'ready', available_at = ?, attempt_token = NULL, lease_until = NULL, error = ?",
        [this.now() + 30_000, message],
      );
    }
    if (kind !== "transient") {
      return this.updateAttempt(
        task,
        "state = ?, attempt_token = NULL, lease_until = NULL, error = ?",
        [kind === "invalid" ? "failed" : "paused", message],
      );
    }
    const retries = task.retry_count;
    return this.updateAttempt(
      task,
      "state = ?, retry_count = ?, available_at = ?, attempt_token = NULL, lease_until = NULL, error = ?",
      [
        retries < RETRY_LIMIT ? "ready" : "failed",
        Math.min(retries + 1, RETRY_LIMIT),
        this.now() + Math.min(300_000, 1000 * 2 ** retries),
        message,
      ],
    );
  }

  private updateAttempt(
    task: LocalProcessingTask,
    assignments: string,
    values: (string | number | null)[],
  ): boolean {
    const now = this.now();
    const result = this.database.sqlite
      .prepare(`
      UPDATE local_meeting_task SET ${assignments}, updated_at = ?
      WHERE id = ? AND state = 'running' AND attempt_token = ? AND lease_until > ?
        AND EXISTS (SELECT 1 FROM local_meeting_processing binding
          WHERE binding.meeting_id = local_meeting_task.meeting_id AND (binding.deleted_at IS NULL OR local_meeting_task.kind = 'purge')
          AND binding.input_revision = local_meeting_task.input_revision)
    `)
      .run(...values, now, task.id, task.attempt_token, now);
    return result.changes === 1;
  }

  retry(meetingId: string, kind: string | null = null): void {
    this.database.sqlite
      .prepare(`
      UPDATE local_meeting_task SET state = 'ready', retry_count = 0, available_at = ?, error = NULL
      WHERE meeting_id = ? AND state IN ('paused', 'failed') AND (? IS NULL OR kind = ?)
        AND EXISTS (SELECT 1 FROM local_meeting_processing WHERE meeting_id = ? AND (deleted_at IS NULL OR local_meeting_task.kind = 'purge'))
    `)
      .run(this.now(), meetingId, kind, kind, meetingId);
  }

  recoverExpired(): void {
    this.database.sqlite
      .prepare(`
      UPDATE local_meeting_task SET state = 'ready', attempt_token = NULL, lease_until = NULL
      WHERE state = 'running' AND lease_until <= ?
    `)
      .run(this.now());
  }

  /** Only the single Main scheduler calls this at startup or after aborting its active work. */
  suspend(): void {
    this.database.sqlite
      .prepare(`
      UPDATE local_meeting_task SET state = 'ready', attempt_token = NULL, lease_until = NULL
      WHERE state = 'running'
    `)
      .run();
  }

  defer(task: LocalProcessingTask, until: number): boolean {
    return this.updateAttempt(
      task,
      "state = 'ready', available_at = ?, attempt_token = NULL, lease_until = NULL",
      [until],
    );
  }

  pauseForPurge(meetingId: string): void {
    this.database.sqlite
      .prepare(
        "UPDATE local_meeting_task SET state = 'paused', attempt_token = NULL, lease_until = NULL, error = '等待永久删除授权' WHERE meeting_id = ? AND kind <> 'purge' AND state IN ('running', 'ready')",
      )
      .run(meetingId);
  }

  enqueuePurge(meetingId: string): void {
    const binding = this.binding(meetingId);
    if (!binding) {
      throw new Error("录音所有者缺失");
    }
    const now = this.now();
    this.database.sqlite
      .prepare(`INSERT INTO local_meeting_task
      (id, meeting_id, input_revision, kind, available_at, created_at, updated_at)
      VALUES (?, ?, ?, 'purge', ?, ?, ?) ON CONFLICT(id) DO NOTHING`)
      .run(
        MeetingTaskStore.taskId(
          {
            accountId: binding.account_id,
            inputRevision: binding.input_revision,
            meetingId,
            workspaceId: binding.workspace_id,
            workspaceSlug: binding.workspace_slug,
          },
          "purge",
        ),
        meetingId,
        binding.input_revision,
        now,
        now,
        now,
      );
  }

  completeResourcePurges(resourceMeetingId: string): void {
    this.database.sqlite
      .prepare(`UPDATE local_meeting_task
      SET state = 'succeeded', output = '{"deleted":true}', error = NULL, attempt_token = NULL, lease_until = NULL, updated_at = ?
      WHERE kind = 'purge' AND meeting_id IN (SELECT meeting_id FROM local_meeting_processing WHERE resource_meeting_id = ? AND deleted_at IS NOT NULL)`)
      .run(this.now(), resourceMeetingId);
  }

  clearDeletedResults(meetingId: string): void {
    this.database.sqlite
      .prepare(
        "UPDATE local_meeting_task SET checkpoint = NULL, output = NULL, error = NULL WHERE meeting_id = ? AND kind <> 'purge'",
      )
      .run(meetingId);
  }

  tombstone(meetingId: string): void {
    this.transaction(() => {
      this.database.sqlite
        .prepare("UPDATE local_meeting_processing SET deleted_at = ? WHERE meeting_id = ?")
        .run(this.now(), meetingId);
      this.database.sqlite
        .prepare(`
        UPDATE local_meeting_task SET state = 'cancelled', attempt_token = NULL, lease_until = NULL
        WHERE meeting_id = ? AND state <> 'succeeded' AND kind <> 'purge'
      `)
        .run(meetingId);
    });
  }
}
