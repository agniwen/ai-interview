import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareMeetingExport as prepareMeetingExportWithDependencies } from "./service";
import type { MeetingExportDependencies } from "./service";

const mocks = {
  loadContext: vi.fn(),
  loadTurnsPage: vi.fn(),
  presign: vi.fn(),
  recordAudit: vi.fn(),
};

const dependencies: MeetingExportDependencies = mocks;

function prepareMeetingExport(input: Parameters<typeof prepareMeetingExportWithDependencies>[0]) {
  return prepareMeetingExportWithDependencies(input, dependencies);
}

const input = {
  format: "json" as const,
  meetingId: "meeting-83",
  organizationId: "org-83",
  userId: "owner-83",
};

const context = {
  activeIntelligenceRevisionId: "intelligence-2",
  intelligence: {
    content: {
      actionItems: [],
      decisions: [],
      openQuestions: [],
      summary: "会议摘要",
      template: "general",
      topics: [],
    },
    createdAt: new Date("2026-08-09T03:00:00.000Z"),
    id: "intelligence-2",
    revision: 2,
    templateKey: "general",
    transcriptRevisionId: "transcript-3",
  },
  kind: "authorized" as const,
  meeting: {
    id: "meeting-83",
    savedAt: new Date("2026-08-09T03:01:00.000Z"),
    startedAt: new Date("2026-08-09T02:00:00.000Z"),
    title: "迁移评审",
  },
  recordingAssets: [
    {
      contentType: "audio/webm",
      storageKey: "private/org-83/playback.webm",
      track: "playback",
    },
    {
      contentType: "audio/webm;codecs=opus",
      storageKey: "private/org-83/system.webm",
      track: "system",
    },
  ],
  transcript: {
    createdAt: new Date("2026-08-09T02:59:00.000Z"),
    id: "transcript-3",
    kind: "human",
    language: "zh",
    revision: 3,
  },
};

describe("Meeting export service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadContext.mockResolvedValue(context);
    mocks.loadTurnsPage
      .mockResolvedValueOnce({
        kind: "authorized",
        turns: [
          {
            endMs: 2000,
            id: "turn-1",
            sequence: 0,
            speakerDisplayName: "候选人",
            startMs: 1000,
            text: "我负责迁移。",
            track: "remote",
          },
        ],
      })
      .mockResolvedValueOnce({ kind: "authorized", turns: [] });
  });

  it("streams only the active authoritative transcript and applicable intelligence", async () => {
    const result = await prepareMeetingExport(input);
    expect(result.kind).toBe("text");
    if (result.kind !== "text") {
      return;
    }
    const output = await new Response(result.body).text();
    expect(JSON.parse(output)).toMatchObject({
      intelligence: { id: "intelligence-2", transcriptRevisionId: "transcript-3" },
      transcript: { id: "transcript-3", kind: "human", revision: 3 },
      turns: [{ id: "turn-1", sequence: 0, speaker: "候选人" }],
    });
    expect(mocks.loadTurnsPage).toHaveBeenCalledWith({
      afterSequence: -1,
      expectedIntelligenceRevisionId: "intelligence-2",
      limit: 500,
      meetingId: "meeting-83",
      organizationId: "org-83",
      revisionId: "transcript-3",
      userId: "owner-83",
    });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "meeting.export_requested" }),
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "meeting.export_succeeded" }),
    );
  });

  it("returns only a signed playback URL and never exposes the storage key", async () => {
    mocks.presign.mockResolvedValue("https://recordings.example/signed");
    const result = await prepareMeetingExport({ ...input, format: "audio" });
    expect(result).toEqual({ kind: "audio", url: "https://recordings.example/signed" });
    expect(mocks.presign).toHaveBeenCalledWith(
      "private/org-83/playback.webm",
      300,
      "迁移评审-playback.webm",
    );
    expect(JSON.stringify(result)).not.toContain("storageKey");
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "meeting.export_authorization_issued",
        detail: expect.objectContaining({
          delivery: "short-lived-direct-object",
          track: "playback",
        }),
      }),
    );
  });

  it("falls back to a verified source asset and allows explicit source-track export", async () => {
    mocks.loadContext.mockResolvedValue({
      ...context,
      recordingAssets: context.recordingAssets.filter((asset) => asset.track === "system"),
    });
    mocks.presign.mockResolvedValue("https://recordings.example/signed-system");
    await expect(prepareMeetingExport({ ...input, format: "audio" })).resolves.toEqual({
      kind: "audio",
      url: "https://recordings.example/signed-system",
    });
    expect(mocks.presign).toHaveBeenCalledWith(
      "private/org-83/system.webm",
      300,
      "迁移评审-system.webm",
    );
  });

  it("exports a human correction while only using a stale Intelligence pointer for race checks", async () => {
    mocks.loadContext.mockResolvedValue({
      ...context,
      activeIntelligenceRevisionId: "stale-intelligence-1",
      intelligence: null,
    });
    const result = await prepareMeetingExport(input);
    expect(result.kind).toBe("text");
    if (result.kind !== "text") {
      return;
    }
    const output = JSON.parse(await new Response(result.body).text());
    expect(output.intelligence).toBeNull();
    expect(output.transcript).toMatchObject({ id: "transcript-3", kind: "human" });
    expect(mocks.loadTurnsPage).toHaveBeenCalledWith(
      expect.objectContaining({ expectedIntelligenceRevisionId: "stale-intelligence-1" }),
    );
  });

  it("records a stable failure when a streamed page fails without leaking diagnostics", async () => {
    mocks.loadTurnsPage.mockReset().mockRejectedValue(new Error("s3://secret/internal-key"));
    const result = await prepareMeetingExport(input);
    expect(result.kind).toBe("text");
    if (result.kind !== "text") {
      return;
    }
    await expect(new Response(result.body).text()).rejects.toThrow();
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "meeting.export_failed",
        detail: expect.objectContaining({ code: "stream-failed", format: "json" }),
      }),
    );
  });

  it("records generic denied evidence without hidden meeting metadata", async () => {
    mocks.loadContext.mockResolvedValue({ kind: "forbidden" });
    expect(await prepareMeetingExport(input)).toEqual({ kind: "forbidden" });
    expect(mocks.recordAudit).toHaveBeenCalledWith({
      action: "meeting.export_denied",
      actorId: "owner-83",
      detail: { code: "forbidden", format: "json" },
      organizationId: "org-83",
    });
    expect(mocks.presign).not.toHaveBeenCalled();
  });
});
