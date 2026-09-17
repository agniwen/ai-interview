import { describe, expect, it, vi } from "vitest";
import type {
  MeetingLiveSummaryCheckpoint,
  MeetingLiveSummaryRequest,
  MeetingLiveSummarySnapshot,
} from "@app/shared/meeting-live-summary";
import type { MeetingLiveTranscriptDraft } from "@app/shared/meeting-transcription";
import { finalizeSavedMeetingSummary } from "./finalize-saved-meeting-summary";
import {
  buildMeetingLiveSummaryTurns,
  meetingLiveSummaryTurnFingerprint,
} from "./live-summary-controller";

const captureId = "00000000-0000-4000-8000-000000000072";
const startedAt = "2026-09-07T03:00:00.000Z";

function draft(count = 2): MeetingLiveTranscriptDraft {
  return {
    capturedAt: startedAt,
    droppedAudioMs: 0,
    droppedPcmFrames: 0,
    error: null,
    provider: "qwen",
    sections: [{ id: "section", sequence: 0, startedAt, track: "system" }],
    turns: Array.from({ length: count }, (_, index) => ({
      endMs: (index + 1) * 1000,
      final: true,
      id: `turn-${index}`,
      sectionId: "section",
      startMs: index * 1000,
      text: `最后一段内容${index}`,
      track: "system",
    })),
  };
}

function summarize(request: MeetingLiveSummaryRequest): MeetingLiveSummarySnapshot {
  const turn = request.turns.at(-1);
  if (!turn) {
    throw new Error("Missing test turn");
  }
  return {
    captureId: request.captureId,
    coveredThroughMs: turn.endMs,
    coveredThroughTurnId: turn.id,
    generatedAt: startedAt,
    model: "test-model",
    provider: "test-provider",
    revision: (request.baseSnapshot?.revision ?? 0) + 1,
    summary: "完整总结",
    template: request.template,
    topics: [
      {
        endMs: turn.endMs,
        evidenceTurnIds: [turn.id],
        id: "topic",
        points: [],
        startMs: turn.startMs,
        status: "active",
        summary: "主题内容",
        title: "会议主题",
      },
    ],
  };
}

function source(transcript = draft()) {
  return { captureId, draft: transcript, startedAt, summary: null, template: "general" as const };
}

describe("saved recording summary finalization", () => {
  it("waits for a valid summary that takes longer than the old 45 second client deadline", async () => {
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("signal timed out", "TimeoutError")), ms);
      return controller.signal;
    });
    try {
      const persist = vi.fn(async () => {});
      const provider = {
        summarize: (request: MeetingLiveSummaryRequest, signal: AbortSignal) => {
          const { promise, resolve, reject } = Promise.withResolvers<MeetingLiveSummarySnapshot>();
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          setTimeout(() => resolve(summarize(request)), 140_000);
          return promise;
        },
      };
      const completion = expect(
        finalizeSavedMeetingSummary(source(), { persist, provider }),
      ).resolves.toMatchObject({ revision: 1 });
      await Promise.all([completion, vi.advanceTimersByTimeAsync(140_000)]);
      expect(persist).toHaveBeenCalledOnce();
    } finally {
      timeout.mockRestore();
      vi.useRealTimers();
    }
  });

  it("keeps progress unacknowledged and explains a real timeout in Chinese", async () => {
    const persist = vi.fn(async () => {});
    const provider = {
      summarize: vi.fn(() => Promise.reject(new DOMException("signal timed out", "TimeoutError"))),
    };
    await expect(finalizeSavedMeetingSummary(source(), { persist, provider })).rejects.toThrow(
      "生成总结超时，已保留补齐进度，请稍后重试",
    );
    expect(persist).not.toHaveBeenCalled();
  });

  it("summarizes a short recording immediately without a character threshold or timer", async () => {
    const provider = {
      summarize: vi.fn((request: MeetingLiveSummaryRequest) => Promise.resolve(summarize(request))),
    };
    const persist = vi.fn(async () => {});
    await finalizeSavedMeetingSummary(source(), { persist, provider });
    expect(provider.summarize).toHaveBeenCalledOnce();
    expect(provider.summarize.mock.calls[0]?.[0].turns).toHaveLength(2);
    expect(persist).toHaveBeenCalledOnce();
  });

  it("includes short tails and corrected earlier turns while retaining the prior summary", async () => {
    const transcript = draft(3);
    const turns = buildMeetingLiveSummaryTurns(transcript, startedAt);
    const summary = summarize({ ...source(), baseSnapshot: null, turns: turns.slice(0, 2) });
    const checkpoint = {
      revision: summary.revision,
      turns: Object.fromEntries(
        turns.slice(0, 2).map((turn) => [turn.id, meetingLiveSummaryTurnFingerprint(turn)]),
      ),
    };
    transcript.turns = transcript.turns.map((turn, index) =>
      index === 0 ? { ...turn, text: "结束时修正的第一句" } : turn,
    );
    const provider = {
      summarize: vi.fn((request: MeetingLiveSummaryRequest) => Promise.resolve(summarize(request))),
    };
    await finalizeSavedMeetingSummary(
      { ...source(transcript), checkpoint, summary },
      { persist: async () => {}, provider },
    );
    expect(provider.summarize.mock.calls[0]?.[0]).toMatchObject({ baseSnapshot: summary });
    expect(provider.summarize.mock.calls[0]?.[0].turns.map((turn) => turn.id)).toEqual([
      "turn-0",
      "turn-2",
    ]);
  });

  it("persists batch progress and resumes after a failure or restart without repeating completed turns", async () => {
    let summary: MeetingLiveSummarySnapshot | null = null;
    let checkpoint: MeetingLiveSummaryCheckpoint | null = null;
    const persist = async (
      next: MeetingLiveSummarySnapshot,
      progress: MeetingLiveSummaryCheckpoint,
    ) => {
      summary = next;
      checkpoint = progress;
      await Promise.resolve();
    };
    const provider = {
      summarize: vi.fn(async (request: MeetingLiveSummaryRequest) => {
        await Promise.resolve();
        if (request.baseSnapshot) {
          throw new Error("网络中断");
        }
        return summarize(request);
      }),
    };
    await expect(
      finalizeSavedMeetingSummary(source(draft(202)), { persist, provider }),
    ).rejects.toThrow("总结待补齐");
    expect(provider.summarize.mock.calls[0]?.[0].turns).toHaveLength(200);
    const retry = {
      summarize: vi.fn((request: MeetingLiveSummaryRequest) => Promise.resolve(summarize(request))),
    };
    await finalizeSavedMeetingSummary(
      { ...source(draft(202)), checkpoint, summary },
      { persist, provider: retry },
    );
    expect(retry.summarize).toHaveBeenCalledOnce();
    expect(retry.summarize.mock.calls[0]?.[0].turns.map((turn) => turn.id)).toEqual([
      "turn-200",
      "turn-201",
    ]);
    await finalizeSavedMeetingSummary(
      { ...source(draft(202)), checkpoint, summary },
      { persist, provider: retry },
    );
    expect(retry.summarize).toHaveBeenCalledOnce();
  });

  it("respects character limits even when there are fewer than 200 turns", async () => {
    const transcript = draft(4);
    transcript.turns = transcript.turns.map((turn) => ({ ...turn, text: "字".repeat(10_000) }));
    const provider = {
      summarize: vi.fn((request: MeetingLiveSummaryRequest) => Promise.resolve(summarize(request))),
    };
    await finalizeSavedMeetingSummary(source(transcript), { persist: async () => {}, provider });
    expect(provider.summarize.mock.calls.map(([request]) => request.turns.length)).toEqual([
      1, 1, 1, 1,
    ]);
  });

  it("never acknowledges unpersisted results and rejects responses from another recording", async () => {
    const provider = {
      summarize: vi.fn((request: MeetingLiveSummaryRequest) =>
        Promise.resolve({
          ...summarize(request),
          captureId: "00000000-0000-4000-8000-000000000099",
        }),
      ),
    };
    const persist = vi.fn(async () => {});
    await expect(finalizeSavedMeetingSummary(source(), { persist, provider })).rejects.toThrow(
      "无效版本",
    );
    expect(persist).not.toHaveBeenCalled();
  });

  it("makes no AI request when there is no final speech", async () => {
    const provider = { summarize: vi.fn() };
    await finalizeSavedMeetingSummary(source(draft(0)), { persist: async () => {}, provider });
    expect(provider.summarize).not.toHaveBeenCalled();
  });
});
