import { echoOperationId } from "./pipeline-output";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  echoTranscriptSchema,
  echoDeviceContextSchema,
  echoDeletionStateSchema,
} from "@app/shared/meeting-device-processing";
import type { meetingIntelligenceTemplateSchema } from "@app/shared/meeting-intelligence";
import type { DesktopDatabase } from "../database";
import type { LocalMeetingRecordingStore } from "../meeting-capture/local-meeting-recording-store";
import type { BeginLocalCaptureInput, LocalSavedMeeting } from "../../preload/meeting-capture";
import type { EchoProcessingOwner, EchoProcessingStatus } from "../../preload/echo-processing-api";
import { MeetingTaskStore } from "./task-store";
import { MeetingTaskScheduler } from "./scheduler";
import { createEchoProcessingHandlers, ECHO_PROCESSING_STEPS } from "./pipeline";
import { localIntelligenceResultSchema } from "./intelligence";
import { completedIntelligenceSummary } from "@app/shared/meeting-completed-summary";
import type { MeetingQuestionExchange } from "@app/shared/meeting-answer";
import { regenerationResultSchema } from "./regeneration";
import { localQuestionInputSchema, localQuestionResultSchema } from "./question";
import { localAdoption } from "./adoption";
import type { ProcessingBindingInput } from "./task-store";
import { EchoServerClient } from "./server-client";

function questionTaskStatus(state: string): "failed" | "pending" {
  return state === "failed" || state === "paused" ? "failed" : "pending";
}

export class EchoProcessingService {
  readonly tasks: MeetingTaskStore;
  private readonly scheduler: MeetingTaskScheduler;
  private readonly recordings: LocalMeetingRecordingStore;
  private readonly artifactRoot: string;
  private readonly client: EchoServerClient;
  private reconciliation: ReturnType<typeof setInterval> | null = null;
  private reconciling = false;

  constructor(input: {
    database: DesktopDatabase;
    recordings: LocalMeetingRecordingStore;
    client: EchoServerClient;
    artifactRoot: string;
    ffmpegBin: string;
    allowedUploadOrigin: string;
  }) {
    this.tasks = new MeetingTaskStore(input.database);
    this.recordings = input.recordings;
    this.artifactRoot = input.artifactRoot;
    this.client = input.client;
    this.scheduler = new MeetingTaskScheduler(
      this.tasks,
      createEchoProcessingHandlers({
        ...input,
        cancelMeeting: (meetingId) => this.scheduler.cancelMeeting(meetingId),
        tasks: this.tasks,
      }),
    );
  }

  bind(input: BeginLocalCaptureInput): void {
    if (!input.owner) {
      throw new Error("录制前需要确定账号和工作区");
    }
    this.tasks.bind({ ...input.owner, inputRevision: "", meetingId: input.captureId }, []);
    this.scheduler.captureStarted(input.captureId);
  }

  prepareLocal(meetingId: string, owner?: EchoProcessingOwner): void {
    if (!this.tasks.binding(meetingId)) {
      if (!owner) {
        throw new Error("请先选择此本地录音所属的账号和工作区");
      }
      this.tasks.bind({ ...owner, inputRevision: "", meetingId }, []);
    }
  }

  captureStarted(meetingId: string): void {
    this.scheduler.captureStarted(meetingId);
  }

  captureFinished(meetingId: string): void {
    this.scheduler.captureFinished(meetingId);
  }

  saved(input: LocalSavedMeeting): void {
    this.captureFinished(input.captureId);
    this.tasks.seal(input.captureId, input.manifestSha256, ECHO_PROCESSING_STEPS);
    this.scheduler.wake();
  }

  async start(): Promise<void> {
    const captures = await this.recordings.recover();
    for (const capture of captures) {
      if (
        capture.status === "saved-local" &&
        capture.manifestSha256 &&
        this.tasks.binding(capture.captureId)
      ) {
        this.tasks.seal(capture.captureId, capture.manifestSha256, ECHO_PROCESSING_STEPS);
      }
    }
    for (const binding of this.tasks.bindings()) {
      if (binding.audio_released_at !== null && binding.deleted_at === null) {
        await this.finishAudioRelease(binding.meeting_id);
      }
    }
    this.resume();
  }

  async regenerate(
    input: Omit<ProcessingBindingInput, "inputRevision"> & {
      template: z.infer<typeof meetingIntelligenceTemplateSchema>;
    },
  ): Promise<string> {
    const server = await this.client.request(
      `/api/w/${encodeURIComponent(input.workspaceSlug)}/meetings/${encodeURIComponent(input.meetingId)}/device`,
      echoDeviceContextSchema,
      {
        accountId: input.accountId,
        signal: AbortSignal.timeout(30_000),
        workspaceId: input.workspaceId,
      },
    );
    if (!server.transcript) {
      throw new Error("最终转录尚未就绪");
    }
    const operationId = randomUUID();
    this.tasks.bind(
      {
        ...input,
        inputRevision: server.transcript.revisionId,
        meetingId: operationId,
        resourceMeetingId: input.meetingId,
      },
      [
        {
          checkpoint: { epoch: server.epoch, template: input.template },
          dependencies: [],
          kind: "regenerate",
        },
        { dependencies: ["regenerate"], kind: "sync-regeneration" },
      ],
    );
    this.scheduler.wake();
    return operationId;
  }

  question(
    input: Omit<ProcessingBindingInput, "inputRevision"> & z.infer<typeof localQuestionInputSchema>,
  ): string {
    const request = localQuestionInputSchema.parse({
      question: input.question,
      requestId: input.requestId,
      threadId: input.threadId,
    });
    this.tasks.bind(
      {
        ...input,
        inputRevision: `question:${echoOperationId(request.requestId, request.threadId, request.question)}`,
        meetingId: request.requestId,
        resourceMeetingId: input.meetingId,
      },
      [
        { checkpoint: { request }, dependencies: [], kind: "question" },
        { dependencies: ["question"], kind: "sync-question" },
      ],
    );
    this.scheduler.wake();
    return request.requestId;
  }

  async adopt(input: Omit<ProcessingBindingInput, "inputRevision">): Promise<void> {
    const server = await this.client.request(
      `/api/w/${encodeURIComponent(input.workspaceSlug)}/meetings/${encodeURIComponent(input.meetingId)}/device`,
      echoDeviceContextSchema,
      {
        accountId: input.accountId,
        signal: AbortSignal.timeout(30_000),
        workspaceId: input.workspaceId,
      },
    );
    this.tasks.bind({ ...input, inputRevision: server.manifestSha256 }, [
      { checkpoint: { epoch: server.epoch }, dependencies: [], kind: "adopt" },
      ...ECHO_PROCESSING_STEPS.map((step) => ({
        ...step,
        dependencies: step.dependencies.length ? step.dependencies : ["adopt"],
      })),
    ]);
    this.tasks.retry(input.meetingId);
    this.scheduler.wake();
  }

  stop(): void {
    this.scheduler.stop();
    if (this.reconciliation) {
      clearInterval(this.reconciliation);
      this.reconciliation = null;
    }
  }
  resume(): void {
    this.scheduler.start();
    if (!this.reconciliation) {
      this.reconciliation = setInterval(() => {
        void this.reconcileDeletions();
      }, 60_000);
      this.reconciliation.unref();
      void this.reconcileDeletions();
    }
  }

  private async reconcileDeletions(): Promise<void> {
    if (this.reconciling) {
      return;
    }
    this.reconciling = true;
    try {
      for (const binding of this.tasks.bindings()) {
        if (
          binding.input_revision === "" ||
          this.tasks.list(binding.meeting_id).some((task) => task.kind === "purge")
        ) {
          continue;
        }
        try {
          const result = await this.client.request(
            `${EchoServerClient.meetingsPath(binding)}/${encodeURIComponent(binding.resource_meeting_id)}/device/deletion`,
            echoDeletionStateSchema,
            {
              accountId: binding.account_id,
              signal: AbortSignal.timeout(15_000),
              workspaceId: binding.workspace_id,
            },
          );
          if (
            (binding.meeting_id !== binding.resource_meeting_id ||
              result.manifestSha256 === binding.input_revision) &&
            result.state !== "retained"
          ) {
            this.purge(binding.meeting_id);
          }
        } catch {
          /* Network and login changes leave all local data intact. */
        }
      }
    } finally {
      this.reconciling = false;
    }
  }

  async requestPurge(input: Omit<ProcessingBindingInput, "inputRevision">): Promise<void> {
    const state = await this.client.request(
      `/api/w/${encodeURIComponent(input.workspaceSlug)}/meetings/${encodeURIComponent(input.meetingId)}/device/deletion`,
      echoDeletionStateSchema,
      {
        accountId: input.accountId,
        signal: AbortSignal.timeout(30_000),
        workspaceId: input.workspaceId,
      },
    );
    if (!state.canAdvance) {
      throw new Error("无权永久删除此录音");
    }
    const original = this.tasks.binding(input.meetingId);
    const ownPurge = this.tasks
      .bindings()
      .find(
        (binding) =>
          binding.resource_meeting_id === input.meetingId &&
          binding.account_id === input.accountId &&
          binding.workspace_id === input.workspaceId &&
          this.tasks.list(binding.meeting_id).some((task) => task.kind === "purge"),
      );
    const ownsOriginal =
      !original ||
      (original.account_id === input.accountId && original.workspace_id === input.workspaceId);
    const localId = ownPurge?.meeting_id ?? (ownsOriginal ? input.meetingId : randomUUID());
    if (!this.tasks.binding(localId)) {
      this.tasks.bind(
        {
          ...input,
          inputRevision: state.manifestSha256,
          meetingId: localId,
          resourceMeetingId: input.meetingId,
        },
        [],
      );
    }
    this.purge(localId);
  }

  purge(meetingId: string): void {
    this.tasks.enqueuePurge(meetingId);
    this.tasks.retry(meetingId, "purge");
    void this.scheduler.cancelMeeting(meetingId);
    this.tasks.pauseForPurge(meetingId);
    this.scheduler.wake();
  }

  retry(meetingId: string): void {
    for (const binding of this.tasks
      .bindings()
      .filter((item) => item.resource_meeting_id === meetingId || item.meeting_id === meetingId)) {
      this.tasks.retry(binding.meeting_id);
    }
    this.scheduler.wake();
  }

  status(meetingId: string, accountId?: string): EchoProcessingStatus {
    const binding = this.tasks.binding(meetingId);
    const bindings = this.tasks
      .bindings()
      .filter(
        (item) =>
          item.resource_meeting_id === meetingId && (!accountId || item.account_id === accountId),
      );
    const tasks = bindings.flatMap((item) => this.tasks.list(item.meeting_id));
    const backup = tasks.find((task) => task.kind === "backup");
    const verified = backup?.output
      ? z.object({ recoveryCopyDeleteAfter: z.string() }).safeParse(JSON.parse(backup.output))
      : null;
    const failed = tasks.find((task) => task.state === "failed" || task.state === "paused");
    let state: EchoProcessingStatus["state"] = "processing";
    if (!bindings.length) {
      state = "unbound";
    } else if (bindings.some((item) => item.deleted_at !== null)) {
      state = tasks.some((task) => task.kind === "purge" && task.state !== "succeeded")
        ? "deleting"
        : "deleted";
    } else if (failed) {
      state = failed.state === "failed" ? "failed" : "paused";
    } else if (tasks.length > 0 && tasks.every((task) => task.state === "succeeded")) {
      state = "complete";
    }
    return {
      audioReleased: Boolean(binding?.audio_released_at),
      backupVerifiedAt: verified?.success ? verified.data.recoveryCopyDeleteAfter : null,
      error: failed?.error ?? null,
      meetingId,
      state,
      tasks: tasks.map((task) => ({
        kind: task.kind,
        retryCount: task.retry_count,
        state: task.state,
      })),
    };
  }

  async context(input: Omit<ProcessingBindingInput, "inputRevision">) {
    const server = await this.client.request(
      `/api/w/${encodeURIComponent(input.workspaceSlug)}/meetings/${encodeURIComponent(input.meetingId)}/device`,
      echoDeviceContextSchema,
      {
        accountId: input.accountId,
        signal: AbortSignal.timeout(30_000),
        workspaceId: input.workspaceId,
      },
    );
    return {
      canAdopt:
        server.processingOwner === "device" &&
        (!server.deviceId || server.deviceId === this.client.deviceId),
      complete: server.processingComplete,
      waitingOnAnotherDevice: !!server.deviceId && server.deviceId !== this.client.deviceId,
    };
  }

  localResults(meetingId: string, accountId?: string) {
    const binding = this.tasks.binding(meetingId);
    const tasks = !accountId || binding?.account_id === accountId ? this.tasks.list(meetingId) : [];
    const transcriptTask = tasks.find(
      (task) => task.kind === "transcript" && task.state === "succeeded",
    );
    const intelligenceTask = tasks.find(
      (task) => task.kind === "intelligence" && task.state === "succeeded",
    );
    const registration = tasks.find(
      (task) => task.kind === "register" && task.state === "succeeded",
    );
    let server = registration?.output
      ? echoDeviceContextSchema.parse(JSON.parse(registration.output))
      : null;
    let transcript = transcriptTask?.output
      ? echoTranscriptSchema.parse(JSON.parse(transcriptTask.output))
      : null;
    let intelligence = intelligenceTask?.output
      ? localIntelligenceResultSchema.parse(JSON.parse(intelligenceTask.output)).content
      : null;
    let updatedAt = intelligenceTask?.updated_at ?? 0;
    for (const command of this.tasks
      .bindings()
      .filter(
        (item) =>
          item.resource_meeting_id === meetingId && (!accountId || item.account_id === accountId),
      )) {
      const task = this.tasks
        .list(command.meeting_id)
        .find((item) => item.kind === "regenerate" && item.state === "succeeded");
      if (task?.output && task.updated_at >= updatedAt) {
        const result = regenerationResultSchema.parse(JSON.parse(task.output));
        ({ server } = result);
        ({ transcript } = result.server);
        ({ content: intelligence } = result);
        ({ updated_at: updatedAt } = task);
      }
    }
    const liveSummary =
      server && transcript && intelligence
        ? completedIntelligenceSummary({
            captureId: meetingId,
            content: intelligence,
            model: server.intelligenceModel.model,
            now: new Date(updatedAt),
            previous: server.liveSummary,
            provider: server.intelligenceModel.provider,
            turns: transcript.turns,
          })
        : null;
    return { intelligence, liveSummary, transcript };
  }

  localQuestions(input: {
    meetingId: string;
    threadId: string;
    accountId: string;
  }): MeetingQuestionExchange[] {
    const rows: MeetingQuestionExchange[] = [];
    for (const binding of this.tasks
      .bindings()
      .filter(
        (item) =>
          item.resource_meeting_id === input.meetingId &&
          item.account_id === input.accountId &&
          item.deleted_at === null,
      )) {
      const task = this.tasks.list(binding.meeting_id).find((item) => item.kind === "question");
      if (!task) {
        continue;
      }
      const result = task.output ? localQuestionResultSchema.parse(JSON.parse(task.output)) : null;
      const request =
        result?.request ??
        z.object({ request: localQuestionInputSchema }).parse(JSON.parse(task.checkpoint ?? "null"))
          .request;
      if (request.threadId !== input.threadId) {
        continue;
      }
      rows.push({
        answer: result?.answer ?? null,
        answeredAt: result ? new Date(task.updated_at).toISOString() : null,
        createdAt: new Date(task.created_at).toISOString(),
        error: task.error,
        id: result?.exchangeId ?? binding.meeting_id,
        question: request.question,
        requestId: request.requestId,
        sequence: rows.length + 1,
        status: result ? "ready" : questionTaskStatus(task.state),
      });
    }
    return rows;
  }

  async discardLocal(meetingId: string): Promise<void> {
    const binding = this.tasks.binding(meetingId);
    if (binding) {
      const result = await this.client
        .request(
          `${EchoServerClient.meetingsPath(binding)}/${encodeURIComponent(meetingId)}/device/deletion`,
          echoDeletionStateSchema,
          {
            accountId: binding.account_id,
            signal: AbortSignal.timeout(15_000),
            workspaceId: binding.workspace_id,
          },
        )
        .catch(() => null);
      if (result?.state === "deleted" && result.manifestSha256 === binding.input_revision) {
        void this.scheduler.cancelMeeting(meetingId);
        this.tasks.tombstone(meetingId);
        await this.recordings.discard(meetingId);
        await rm(join(this.artifactRoot, meetingId), { force: true, recursive: true });
        this.tasks.clearDeletedResults(meetingId);
        return;
      }
    }
    await this.releaseAudio(meetingId);
  }

  async releaseAudio(meetingId: string): Promise<void> {
    this.tasks.authorizeAudioRelease(meetingId);
    await this.finishAudioRelease(meetingId);
  }

  private async finishAudioRelease(meetingId: string): Promise<void> {
    const adopted = localAdoption(this.tasks, meetingId);
    if (!adopted || adopted.useLocalCapture) {
      await this.recordings.releaseAudio(meetingId);
    }
    await rm(join(this.artifactRoot, meetingId), { force: true, recursive: true });
  }
}
