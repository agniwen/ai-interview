import { MeetingTaskDeferredError } from "./task-deferred-error";
import type { JsonValue } from "@app/db-schema/json";
import { classifyMeetingTaskError, MeetingTaskError } from "./task-error";
import type { LocalProcessingBinding, LocalProcessingTask, MeetingTaskStore } from "./task-store";

export interface TaskContext {
  task: LocalProcessingTask;
  binding: LocalProcessingBinding;
  signal: AbortSignal;
  checkpoint: (value: JsonValue) => void;
}
export type MeetingTaskHandler = (context: TaskContext) => Promise<JsonValue>;

/** Main owns this pump; Renderer lifecycle never owns a task Promise. */
export class MeetingTaskScheduler {
  private readonly store: MeetingTaskStore;
  private readonly handlers: Readonly<Record<string, MeetingTaskHandler>>;
  private readonly concurrency: number;
  private readonly active = new Map<string, AbortController>();
  private readonly executions = new Map<string, Promise<void>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = true;
  private readonly captures = new Set<string>();

  constructor(
    store: MeetingTaskStore,
    handlers: Readonly<Record<string, MeetingTaskHandler>>,
    concurrency = 2,
  ) {
    this.store = store;
    this.handlers = handlers;
    this.concurrency = concurrency;
  }

  start(): void {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    this.store.suspend();
    this.timer = setInterval(() => this.wake(), 2000);
    this.timer.unref();
    this.wake();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const controller of this.active.values()) {
      controller.abort();
    }
    this.store.suspend();
  }

  async cancelMeeting(meetingId: string): Promise<void> {
    const pending: Promise<void>[] = [];
    for (const task of this.store.list(meetingId)) {
      if (task.kind !== "purge") {
        this.active.get(task.id)?.abort();
        const execution = this.executions.get(task.id);
        if (execution) {
          pending.push(execution);
        }
      }
    }
    await Promise.all(pending);
  }

  captureStarted(meetingId: string): void {
    this.captures.add(meetingId);
    for (const binding of this.store.bindings()) {
      for (const task of this.store.list(binding.meeting_id)) {
        if (task.kind === "media" && this.active.has(task.id)) {
          this.store.defer(task, Date.now());
          this.active.get(task.id)?.abort();
        }
      }
    }
  }

  captureFinished(meetingId: string): void {
    this.captures.delete(meetingId);
    this.wake();
  }

  wake(): void {
    while (!this.stopped && this.active.size < this.concurrency) {
      const task = this.store.claim(
        Object.keys(this.handlers).filter((kind) => !this.captures.size || kind !== "media"),
      );
      if (!task) {
        return;
      }
      const binding = this.store.binding(task.meeting_id);
      const handler = this.handlers[task.kind];
      if (!(binding && handler)) {
        this.store.fail(task, "invalid", "任务处理器或所有者缺失");
        continue;
      }
      const controller = new AbortController();
      this.active.set(task.id, controller);
      this.executions.set(task.id, this.execute(task, binding, handler, controller));
    }
  }

  private async execute(
    task: LocalProcessingTask,
    binding: LocalProcessingBinding,
    handler: MeetingTaskHandler,
    controller: AbortController,
  ): Promise<void> {
    const heartbeat = setInterval(() => {
      if (!controller.signal.aborted && !this.store.renew(task)) {
        controller.abort();
      }
    }, 30_000);
    heartbeat.unref();
    try {
      const output = await handler({
        binding,
        checkpoint: (value) => {
          if (controller.signal.aborted || !this.store.checkpoint(task, value)) {
            controller.abort();
            throw new MeetingTaskError("offline", "任务已暂停或被替代");
          }
        },
        signal: controller.signal,
        task,
      });
      if (!controller.signal.aborted) {
        this.store.complete(task, output);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof MeetingTaskDeferredError) {
          this.store.defer(task, error.until);
        } else {
          this.store.fail(
            task,
            error instanceof Error ? classifyMeetingTaskError(error) : "transient",
            error instanceof Error ? error.message : "处理失败",
          );
        }
      }
    } finally {
      clearInterval(heartbeat);
      this.active.delete(task.id);
      this.executions.delete(task.id);
      if (!this.stopped) {
        this.wake();
      }
    }
  }
}
