import { describe, expect, it } from "vitest";
import type { MeetingLiveTranscriptDraftRecord } from "@app/db-schema/meeting-live-transcript";
import {
  buildLiveTranscriptTurns,
  selectLiveTranscriptSource,
} from "../human-interview-live-transcript-promotion";
import type { LiveTranscriptInterviewer } from "../human-interview-live-transcript-promotion";

function draft(turns: MeetingLiveTranscriptDraftRecord["turns"]): MeetingLiveTranscriptDraftRecord {
  return {
    capturedAt: "2026-09-01T02:00:00.000Z",
    droppedAudioMs: 0,
    droppedPcmFrames: 0,
    error: null,
    sections: [
      { id: "local", sequence: 0, startedAt: "2026-09-01T02:00:00.000Z", track: "microphone" },
      { id: "remote", sequence: 1, startedAt: "2026-09-01T02:00:00.000Z", track: "system" },
    ],
    turns,
  };
}

const finalTurn = {
  endMs: 2000,
  final: true,
  id: "turn-1",
  sectionId: "local",
  startMs: 500,
  text: "请介绍一下项目经验。",
  track: "microphone" as const,
};

function interviewer(
  userId: string,
  role: string,
  liveTranscriptDraft: MeetingLiveTranscriptDraftRecord | null,
): LiveTranscriptInterviewer {
  return { liveTranscriptDraft, name: `面试官 ${userId}`, role, userId };
}

describe("selectLiveTranscriptSource", () => {
  it("prefers the actor, then the host, then any interviewer with final subtitles", () => {
    const host = interviewer("host", "host", draft([finalTurn]));
    const actor = interviewer("actor", "interviewer", draft([finalTurn]));
    const other = interviewer("other", "interviewer", draft([finalTurn]));

    expect(selectLiveTranscriptSource([other, host, actor], "actor")?.owner.userId).toBe("actor");
    expect(selectLiveTranscriptSource([other, host, actor], null)?.owner.userId).toBe("host");
    expect(selectLiveTranscriptSource([other], "actor")?.owner.userId).toBe("other");
  });

  it("skips drafts that only contain unfinished subtitles", () => {
    const host = interviewer("host", "host", draft([{ ...finalTurn, final: false }]));
    const other = interviewer("other", "interviewer", draft([finalTurn]));

    expect(selectLiveTranscriptSource([host, other], null)?.owner.userId).toBe("other");
    expect(selectLiveTranscriptSource([host, interviewer("empty", "host", null)], null)).toBeNull();
  });
});

describe("buildLiveTranscriptTurns", () => {
  it("keeps final subtitles and attributes the remote track to the candidate", () => {
    const owner = interviewer(
      "host",
      "host",
      draft([
        finalTurn,
        { ...finalTurn, final: false, id: "partial", text: "未定稿" },
        {
          endMs: 5000,
          final: true,
          id: "turn-2",
          sectionId: "remote",
          startMs: 2500,
          text: "我负责过核心系统改造。",
          track: "system",
        },
      ]),
    );
    const source = selectLiveTranscriptSource([owner], null);
    if (!source) {
      throw new Error("expected a live transcript source");
    }

    expect(
      buildLiveTranscriptTurns({ candidateName: "候选人甲", roundId: "round-1", source }),
    ).toMatchObject([
      {
        sequence: 0,
        speakerDisplayName: "面试官 host",
        speakerKey: "interviewer:host",
        text: "请介绍一下项目经验。",
        track: "local",
      },
      {
        sequence: 1,
        speakerDisplayName: "候选人甲",
        speakerKey: "candidate:round-1",
        text: "我负责过核心系统改造。",
        track: "remote",
      },
    ]);
  });
});
