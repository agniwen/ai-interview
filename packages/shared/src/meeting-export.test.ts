import { describe, expect, it } from "vitest";
import {
  formatMeetingExportFooter,
  formatMeetingExportHeader,
  formatMeetingExportTurn,
  formatMeetingExportTimestamp,
  meetingExportFormatSchema,
} from "./meeting-export";
import type { MeetingExportSnapshot } from "./meeting-export";

const snapshot: MeetingExportSnapshot = {
  intelligence: {
    content: {
      actionItems: [],
      decisions: [{ evidenceTurnIds: ["turn-1"], statement: "采用方案 A" }],
      openQuestions: [],
      summary: "讨论了迁移方案。",
      template: "general",
      topics: [],
    },
    createdAt: "2026-08-09T03:00:00.000Z",
    id: "intelligence-2",
    revision: 2,
    template: "general",
    transcriptRevisionId: "transcript-3",
  },
  meeting: {
    id: "meeting-83",
    savedAt: "2026-08-09T03:01:00.000Z",
    startedAt: "2026-08-09T02:00:00.000Z",
    title: "迁移评审",
  },
  transcript: {
    createdAt: "2026-08-09T02:59:00.000Z",
    id: "transcript-3",
    kind: "human",
    language: "zh",
    revision: 3,
  },
};

const turn = {
  endMs: 3_723_456,
  id: "turn-1",
  sequence: 0,
  speaker: "候选人",
  startMs: 3_661_007,
  text: "我负责迁移。",
  track: "remote" as const,
};

describe("Meeting export contract", () => {
  it("accepts only the five public export formats", () => {
    expect(meetingExportFormatSchema.options).toEqual(["audio", "markdown", "txt", "srt", "json"]);
    expect(meetingExportFormatSchema.safeParse("provider-json").success).toBe(false);
  });

  it("formats valid SRT timestamps and preserves speaker and order", () => {
    expect(formatMeetingExportTimestamp(turn.startMs, "srt")).toBe("01:01:01,007");
    expect(formatMeetingExportTurn("srt", turn, true)).toBe(
      "1\n01:01:01,007 --> 01:02:03,456\n候选人: 我负责迁移。\n\n",
    );
  });

  it("normalizes CRLF and blank lines without terminating an SRT cue early", () => {
    expect(
      formatMeetingExportTurn(
        "srt",
        {
          ...turn,
          speaker: "候选人\n一号",
          text: "第一行\r\n\r\n第二行\n  \n第三行",
        },
        true,
      ),
    ).toBe("1\n01:01:01,007 --> 01:02:03,456\n候选人 一号: 第一行\n第二行\n第三行\n\n");
  });

  it("identifies authoritative transcript and intelligence revisions in Markdown", () => {
    const output = `${formatMeetingExportHeader("markdown", snapshot)}${formatMeetingExportTurn("markdown", turn, true)}${formatMeetingExportFooter("markdown")}`;
    expect(output).toContain("Transcript revision: 3 (transcript-3, human)");
    expect(output).toContain("Meeting Intelligence revision: 2 (intelligence-2, general)");
    expect(output).toContain("采用方案 A");
    expect(output).toContain("候选人: 我负责迁移。");
    expect(output).toContain("turn:turn-1");
  });

  it("streams valid public JSON without internal provider or storage metadata", () => {
    const output = `${formatMeetingExportHeader("json", snapshot)}${formatMeetingExportTurn("json", turn, true)}${formatMeetingExportFooter("json")}`;
    const parsed = JSON.parse(output);
    expect(parsed.transcript).toMatchObject({ id: "transcript-3", kind: "human", revision: 3 });
    expect(parsed.intelligence).toMatchObject({ id: "intelligence-2", revision: 2 });
    expect(parsed.turns).toEqual([turn]);
    expect(output).not.toMatch(/provider|model|region|storageKey|speakerKey|confidence/);
  });
});
