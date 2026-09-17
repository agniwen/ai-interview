import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import {
  echoDeviceContextSchema,
  echoSyncIntelligenceSchema,
} from "@app/shared/meeting-device-processing";
import { MEETING_ANSWER_INSUFFICIENT_EVIDENCE_TEXT } from "@app/shared/meeting-answer";
import { DesktopDatabase } from "../database";
import { LocalMeetingRecordingStore } from "../meeting-capture/local-meeting-recording-store";
import { EchoServerClient } from "./server-client";
import { EchoProcessingService } from "./service";
import { createEchoQuestionHandlers } from "./question";
import { createEchoRegenerationHandlers } from "./regeneration";

it("saves questions and regeneration locally across restarts before each independent publication", async () => {
  const root = await mkdtemp(join(tmpdir(), "echo-commands-"));
  const databaseOptions = {
    migrationsFolder: join(process.cwd(), "drizzle-local"),
    path: join(root, "db.sqlite"),
  };
  let database = new DesktopDatabase(databaseOptions);
  const recordings = new LocalMeetingRecordingStore(join(root, "recordings"));
  await recordings.recover();
  const meetingId = "00000000-0000-4000-8000-000000000601";
  const requestId = "00000000-0000-4000-8000-000000000602";
  const owner = {
    accountId: "reader",
    meetingId,
    workspaceId: "workspace",
    workspaceSlug: "fixed-workspace",
  };
  const original = {
    actionItems: [],
    decisions: [],
    openQuestions: [],
    summary: "旧摘要",
    template: "general",
    topics: [],
  };
  const refreshed = { ...original, summary: "新摘要" };
  const context = echoDeviceContextSchema.parse({
    accountId: "reader",
    deviceId: "device",
    epoch: 1,
    intelligence: original,
    intelligenceModel: { model: "model", provider: "provider" },
    intelligenceRevisionId: "old-revision",
    liveSummary: null,
    liveTranscriptDraft: null,
    manifestSha256: "a".repeat(64),
    meetingId,
    playbackReady: true,
    processingComplete: true,
    processingOwner: "device",
    recoveryCopyDeleteAfter: new Date().toISOString(),
    savedAt: new Date().toISOString(),
    sourceVerified: true,
    startedAt: new Date().toISOString(),
    suggestedTemplate: "general",
    title: "命令测试",
    transcript: {
      language: "zh",
      model: "model",
      pipelineVersion: "test",
      provider: "qwen",
      region: "cn",
      revisionId: "transcript",
      turns: [
        {
          confidence: null,
          endMs: 1000,
          id: "turn",
          speakerDisplayName: null,
          speakerKey: "local",
          startMs: 0,
          text: "周五交付",
          track: "local",
        },
      ],
    },
    transcription: {
      languageHint: null,
      model: "model",
      pipelineVersion: "test",
      provider: "qwen",
      region: "cn",
    },
  });
  const requests: string[] = [];
  const client = new EchoServerClient({
    deviceId: "device",
    fetch: vi.fn((url, options) => {
      const path = new URL(String(url)).pathname;
      requests.push(path);
      expect(path).toContain(`/fixed-workspace/meetings/${meetingId}/device`);
      expect(new Headers(options?.headers).get("X-Echo-Account-Id")).toBe("reader");
      expect(new Headers(options?.headers).get("X-Echo-Workspace-Id")).toBe("workspace");
      let response: Response;
      if (path.endsWith("/start")) {
        response = Response.json({ epoch: 1, exchangeId: "exchange" });
      } else if (path.endsWith("/generate")) {
        response = Response.json({
          result: {
            answer: {
              citations: [],
              kind: "insufficient-evidence",
              text: MEETING_ANSWER_INSUFFICIENT_EVIDENCE_TEXT,
            },
            exchangeId: "exchange",
            executionToken: "execution",
          },
          state: "complete",
        });
      } else if (path.endsWith("/questions/sync")) {
        response = Response.json({ result: { synchronized: true }, state: "complete" });
      } else if (path.endsWith("/adopt")) {
        response = Response.json({ context: { ...context, epoch: 2 }, sources: [] });
      } else if (path.endsWith("/step")) {
        response = Response.json({
          result: { content: refreshed, state: "ready" },
          state: "complete",
        });
      } else if (path.endsWith("/sync/intelligence")) {
        const body = echoSyncIntelligenceSchema.parse(JSON.parse(z.string().parse(options?.body)));
        expect(body.expectedIntelligenceRevisionId).toBe("old-revision");
        expect(body.epoch).toBe(2);
        expect(body.transcriptRevisionId).toBe("transcript");
        response = Response.json({ result: { revisionId: "new-revision" }, state: "complete" });
      } else {
        response = Response.json(context);
      }
      return Promise.resolve(response);
    }),
    origin: "https://echo.example",
  });
  const dependencies = {
    allowedUploadOrigin: "https://recordings.example",
    artifactRoot: join(root, "artifacts"),
    client,
    ffmpegBin: "unused",
    recordings,
  };
  let service = new EchoProcessingService({ ...dependencies, database });
  const run = async (
    operationId: string,
    kind: "question" | "sync-question" | "regenerate" | "sync-regeneration",
  ) => {
    const task = service.tasks.claim([kind]);
    const binding = service.tasks.binding(operationId);
    if (!(task && binding)) {
      throw new Error("missing command task");
    }
    const handlers = {
      ...createEchoQuestionHandlers({ client, tasks: service.tasks }),
      ...createEchoRegenerationHandlers({ client, tasks: service.tasks }),
    };
    const output = await handlers[kind]({
      binding,
      checkpoint: (value) => {
        expect(service.tasks.checkpoint(task, value)).toBe(true);
      },
      signal: AbortSignal.timeout(5000),
      task,
    });
    expect(service.tasks.complete(task, output)).toBe(true);
  };
  const reopen = () => {
    database.close();
    database = new DesktopDatabase(databaseOptions);
    service = new EchoProcessingService({ ...dependencies, database });
  };
  try {
    service.question({ ...owner, question: "没有提到的内容？", requestId, threadId: "thread" });
    expect(() =>
      service.question({ ...owner, question: "不同输入", requestId, threadId: "thread" }),
    ).toThrow("已绑定");
    await run(requestId, "question");
    expect(requests.some((path) => path.endsWith("/questions/sync"))).toBe(false);
    reopen();
    expect(
      service.localQuestions({ accountId: "reader", meetingId, threadId: "thread" })[0]?.answer
        ?.text,
    ).toBe(MEETING_ANSWER_INSUFFICIENT_EVIDENCE_TEXT);
    expect(
      service.localQuestions({ accountId: "other-account", meetingId, threadId: "thread" }),
    ).toEqual([]);
    await run(requestId, "sync-question");
    const regenerationId = await service.regenerate({ ...owner, template: "general" });
    await run(regenerationId, "regenerate");
    expect(requests.some((path) => path.endsWith("/sync/intelligence"))).toBe(false);
    reopen();
    expect(service.localResults(meetingId, "reader").intelligence?.summary).toBe("新摘要");
    await run(regenerationId, "sync-regeneration");
    expect(requests.filter((path) => path.endsWith("/generate"))).toHaveLength(1);
    expect(requests.filter((path) => path.endsWith("/adopt"))).toHaveLength(1);
    expect(requests.filter((path) => path.endsWith("/step"))).toHaveLength(1);
    expect(service.status(meetingId, "reader").state).toBe("complete");
    for (const binding of service.tasks.bindings()) {
      service.tasks.tombstone(binding.meeting_id);
      service.tasks.clearDeletedResults(binding.meeting_id);
    }
    expect(service.status(meetingId, "reader").state).toBe("deleted");
    expect(service.localResults(meetingId, "reader").intelligence).toBeNull();
  } finally {
    database.close();
    await rm(root, { force: true, recursive: true });
  }
});
