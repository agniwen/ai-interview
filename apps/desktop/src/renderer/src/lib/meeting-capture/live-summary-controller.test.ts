import { describe, expect, it, vi } from "vitest";
import type { LiveTranscriptDraftSnapshot } from "./live-transcript-draft";
import {
  buildMeetingLiveSummaryTurns,
  createMeetingLiveSummaryController,
} from "./live-summary-controller";

const captureId = "00000000-0000-4000-8000-000000000072";

function transcriptSnapshot(): LiveTranscriptDraftSnapshot {
  return {
    captureId,
    droppedAudioMs: 0,
    droppedPcmFrames: 0,
    error: null,
    model: "nova-3",
    provider: "deepgram",
    queuePeakAudioMs: 0,
    queuedAudioMs: 0,
    queuedPcmBytes: 0,
    sections: [
      {
        id: "section-1",
        sequence: 0,
        startedAt: "2026-09-04T03:00:00.000Z",
        track: "system",
      },
      {
        id: "section-2",
        sequence: 1,
        startedAt: "2026-09-04T03:01:00.000Z",
        track: "microphone",
      },
    ],
    status: "live",
    trackDroppedAudioMs: { microphone: 0, system: 0 },
    trackQueuePeakAudioMs: { microphone: 0, system: 0 },
    trackQueuedAudioMs: { microphone: 0, system: 0 },
    trackStatus: { microphone: "live", system: "live" },
    turns: [
      {
        endMs: 2000,
        final: true,
        id: "turn-1",
        sectionId: "section-1",
        speakerKey: "deepgram-1",
        startMs: 1000,
        text: "第一段稳定字幕",
        track: "system",
      },
      {
        endMs: 3000,
        final: false,
        id: "turn-interim",
        sectionId: "section-1",
        startMs: 2000,
        text: "仍会变化",
        track: "system",
      },
      {
        endMs: 4000,
        final: true,
        id: "turn-2",
        sectionId: "section-2",
        startMs: 2000,
        text: "恢复录制后的字幕",
        track: "microphone",
      },
    ],
  };
}

const restoredSummary = {
  captureId,
  coveredThroughMs: 2000,
  coveredThroughTurnId: "turn-1",
  generatedAt: "2026-09-04T03:00:10.000Z",
  model: "test-model",
  provider: "test-provider",
  revision: 2,
  summary: "已经保存的实时总结。",
  template: "general" as const,
  topics: [
    {
      endMs: 2000,
      evidenceTurnIds: ["turn-1"],
      id: "topic-restored",
      points: [],
      startMs: 1000,
      status: "active" as const,
      summary: "保存的主题",
      title: "恢复主题",
    },
  ],
};

describe("meeting live summary controller", () => {
  it("normalizes final turns onto the meeting timeline", () => {
    expect(buildMeetingLiveSummaryTurns(transcriptSnapshot(), "2026-09-04T03:00:00.000Z")).toEqual([
      expect.objectContaining({
        endMs: 2000,
        id: "turn-1",
        speakerKey: "deepgram-1",
        startMs: 1000,
      }),
      expect.objectContaining({
        endMs: 64_000,
        id: "turn-2",
        speakerKey: "microphone",
        startMs: 62_000,
      }),
    ]);
  });

  it("restores a persisted summary and only sends uncovered Qwen turns", async () => {
    const scheduled: (() => void)[] = [];
    const request = vi.fn().mockResolvedValue({
      ...restoredSummary,
      coveredThroughMs: 64_000,
      coveredThroughTurnId: "turn-2",
      revision: 3,
      summary: "恢复后继续更新。",
    });
    const controller = createMeetingLiveSummaryController({
      initialDelayMs: 0,
      minCharacters: 1,
      provider: { summarize: request },
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- The fake scheduler captures callbacks for deterministic control.
      schedule: (callback) => {
        scheduled.push(callback);
        return () => {};
      },
    });
    controller.update({
      captureId,
      initialSummary: restoredSummary,
      meetingStartedAt: "2026-09-04T03:00:00.000Z",
      template: "general",
      transcript: { ...transcriptSnapshot(), model: "qwen3-asr-flash-realtime", provider: "qwen" },
    });

    expect(controller.getSnapshot()).toMatchObject({ status: "ready", summary: restoredSummary });
    scheduled.shift()?.();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      baseSnapshot: restoredSummary,
      turns: [expect.objectContaining({ id: "turn-2" })],
    });
    controller.dispose();
  });

  it("adopts a persisted summary that hydrates after the active capture", async () => {
    const scheduled: (() => void)[] = [];
    const request = vi.fn().mockResolvedValue({
      ...restoredSummary,
      coveredThroughMs: 64_000,
      coveredThroughTurnId: "turn-2",
      revision: 3,
    });
    const controller = createMeetingLiveSummaryController({
      initialDelayMs: 0,
      minCharacters: 1,
      provider: { summarize: request },
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- The fake scheduler captures callbacks for deterministic control.
      schedule: (callback) => {
        scheduled.push(callback);
        return () => {};
      },
    });
    const source = {
      captureId,
      meetingStartedAt: "2026-09-04T03:00:00.000Z",
      template: "general" as const,
      transcript: transcriptSnapshot(),
    };
    controller.update(source);
    controller.update({ ...source, initialSummary: restoredSummary });

    expect(controller.getSnapshot()).toMatchObject({ status: "ready", summary: restoredSummary });
    scheduled.at(-1)?.();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      baseSnapshot: restoredSummary,
      turns: [expect.objectContaining({ id: "turn-2" })],
    });
    controller.dispose();
  });

  it("coalesces updates, keeps the last good tree on failure, and ignores a stale capture", async () => {
    const scheduled: (() => void)[] = [];
    const request = vi.fn().mockResolvedValue({
      captureId,
      coveredThroughMs: 64_000,
      coveredThroughTurnId: "turn-2",
      generatedAt: "2026-09-04T03:01:05.000Z",
      model: "test-model",
      provider: "test-provider",
      revision: 1,
      summary: "讨论了两段内容。",
      template: "general",
      topics: [
        {
          endMs: 64_000,
          evidenceTurnIds: ["turn-1", "turn-2"],
          id: "topic-1",
          points: [],
          startMs: 1000,
          status: "active",
          summary: "当前主题",
          title: "测试主题",
        },
      ],
    });
    const controller = createMeetingLiveSummaryController({
      initialDelayMs: 0,
      minCharacters: 1,
      provider: { summarize: request },
      retryDelayMs: 0,
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- The fake scheduler intentionally captures callbacks for deterministic control.
      schedule: (callback) => {
        scheduled.push(callback);
        return () => {};
      },
    });

    controller.update({
      captureId,
      meetingStartedAt: "2026-09-04T03:00:00.000Z",
      template: "general",
      transcript: transcriptSnapshot(),
    });
    scheduled.shift()?.();
    await vi.waitFor(() => expect(controller.getSnapshot().status).toBe("ready"));
    expect(request).toHaveBeenCalledTimes(1);

    request.mockRejectedValueOnce(new Error("network down"));
    const changed = transcriptSnapshot();
    changed.turns.push({
      endMs: 7000,
      final: true,
      id: "turn-3",
      sectionId: "section-2",
      startMs: 5000,
      text: "新的稳定字幕",
      track: "microphone",
    });
    controller.update({
      captureId,
      meetingStartedAt: "2026-09-04T03:00:00.000Z",
      template: "general",
      transcript: changed,
    });
    scheduled.shift()?.();
    await vi.waitFor(() => expect(controller.getSnapshot().status).toBe("degraded"));
    expect(controller.getSnapshot().summary?.summary).toBe("讨论了两段内容。");
    expect(scheduled).toHaveLength(1);

    controller.update({
      captureId: "00000000-0000-4000-8000-000000000073",
      meetingStartedAt: "2026-09-04T04:00:00.000Z",
      template: "general",
      transcript: { ...changed, captureId: "00000000-0000-4000-8000-000000000073" },
    });
    expect(controller.getSnapshot()).toMatchObject({
      captureId: "00000000-0000-4000-8000-000000000073",
      summary: null,
    });
    controller.dispose();
  });
});
