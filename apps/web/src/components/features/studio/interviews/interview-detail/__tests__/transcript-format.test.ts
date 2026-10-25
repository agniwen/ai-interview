import type { DisplayInterviewTurn } from "@app/shared/interview-transcript-turns";
import { describe, expect, it } from "vitest";

import { buildTranscriptText, findPlaybackTurnId, formatCallTime } from "../transcript-format";

function turn(
  id: string,
  role: DisplayInterviewTurn["role"],
  message: string,
  timeInCallSecs: number | null,
): DisplayInterviewTurn {
  return {
    conversationId: "conv-1",
    createdAt: "2026-10-25T08:00:00.000Z",
    id,
    interviewRecordId: null,
    message,
    rawTurnIndexes: [1],
    receivedAt: "2026-10-25T08:00:00.000Z",
    role,
    source: "livekit",
    timeInCallSecs,
  };
}

describe("formatCallTime", () => {
  it("formats in-call offsets as m:ss and h:mm:ss", () => {
    expect(formatCallTime(0)).toBe("0:00");
    expect(formatCallTime(97.8)).toBe("1:37");
    expect(formatCallTime(3725)).toBe("1:02:05");
  });
});

describe("findPlaybackTurnId", () => {
  const turns = [
    turn("a", "agent", "你好", 2),
    turn("b", "user", "你好", 8),
    turn("untimed", "agent", "补充说明", null),
    turn("c", "agent", "第一题", 48),
  ];

  it("returns nothing before playback starts or before the first timed turn", () => {
    expect(findPlaybackTurnId(turns, null)).toBeNull();
    expect(findPlaybackTurnId(turns, 1)).toBeNull();
  });

  it("selects the last turn that started at or before the playback position", () => {
    expect(findPlaybackTurnId(turns, 8)).toBe("b");
    expect(findPlaybackTurnId(turns, 47.9)).toBe("b");
    expect(findPlaybackTurnId(turns, 600)).toBe("c");
  });
});

describe("buildTranscriptText", () => {
  it("labels speakers and prefixes in-call time when present", () => {
    const text = buildTranscriptText(
      [turn("a", "agent", " 请介绍一个项目。 ", 90), turn("b", "user", "我负责召回项目。", null)],
      { candidate: "陈绮浈", interviewer: "AI 面试官" },
    );

    expect(text).toBe("[1:30] AI 面试官：请介绍一个项目。\n\n陈绮浈：我负责召回项目。");
  });
});
