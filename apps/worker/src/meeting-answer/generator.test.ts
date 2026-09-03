import { describe, expect, it, vi } from "vitest";
import { generateMeetingAnswer, selectMeetingAnswerTranscriptContext } from "./generator";
import { isMeetingAnswerTerminalError } from "@app/shared/meeting-answer";

const turns = [
  {
    endMs: 5000,
    id: "turn-payment-1",
    speakerDisplayName: "候选人",
    speakerKey: "remote-0",
    startMs: 1000,
    text: "我负责支付系统迁移和灰度发布。",
  },
  {
    endMs: 9000,
    id: "turn-payment-2",
    speakerDisplayName: "面试官",
    speakerKey: "local",
    startMs: 6000,
    text: "这个项目持续了多久？",
  },
  {
    endMs: 65_000,
    id: "turn-lunch",
    speakerDisplayName: null,
    speakerKey: "local",
    startMs: 60_000,
    text: "午餐安排在十二点。",
  },
];

describe("Meeting Answer generator", () => {
  it("retrieves only relevant transcript windows from the current meeting", () => {
    expect(
      selectMeetingAnswerTranscriptContext({
        intelligence: null,
        notes: [],
        previous: [],
        question: "谁负责支付系统迁移？",
        turns,
      }).map((turn) => turn.id),
    ).toEqual(["turn-payment-1", "turn-payment-2"]);
  });

  it("uses a matched timestamped note only to locate transcript evidence", () => {
    expect(
      selectMeetingAnswerTranscriptContext({
        intelligence: null,
        notes: [{ body: "支付迁移是重点", meetingTimeMs: 3000 }],
        previous: [],
        question: "重点是什么？",
        turns,
      }).map((turn) => turn.id),
    ).toContain("turn-payment-1");
  });

  it("uses a bounded transcript-wide sample for a general summary question", () => {
    const longTranscript = Array.from({ length: 100 }, (_, index) => ({
      endMs: index * 1000 + 900,
      id: `turn-${index}`,
      speakerDisplayName: null,
      speakerKey: index % 2 === 0 ? "local" : "remote-0",
      startMs: index * 1000,
      text: `第 ${index} 段内容`,
    }));
    const selected = selectMeetingAnswerTranscriptContext({
      intelligence: null,
      notes: [],
      previous: [],
      question: "总结一下这次会议",
      turns: longTranscript,
    });

    expect(selected).toHaveLength(24);
    expect(selected[0]?.id).toBe("turn-0");
    expect(selected.at(-1)?.id).toBe("turn-99");
  });

  it("materializes a valid model turn citation into a playable range", async () => {
    const agent = {
      generate: vi.fn().mockResolvedValue({
        object: {
          citationTurnIds: ["turn-payment-1"],
          kind: "answer",
          text: "候选人负责支付系统迁移。",
        },
        text: "",
      }),
    };
    await expect(
      generateMeetingAnswer(
        {
          intelligence: null,
          notes: [],
          previous: [],
          question: "谁负责支付系统迁移？",
          turns,
        },
        agent,
      ),
    ).resolves.toEqual({
      citations: [{ endMs: 5000, startMs: 1000, turnId: "turn-payment-1" }],
      kind: "answer",
      text: "候选人负责支付系统迁移。",
    });
  });

  it("rejects citations that were not supplied to this retrieval call", async () => {
    const agent = {
      generate: vi.fn().mockResolvedValue({
        object: {
          citationTurnIds: ["turn-lunch"],
          kind: "answer",
          text: "午餐是十二点。",
        },
        text: "",
      }),
    };
    await expect(
      generateMeetingAnswer(
        {
          intelligence: null,
          notes: [],
          previous: [],
          question: "谁负责支付系统迁移？",
          turns,
        },
        agent,
      ),
    ).rejects.toThrow("Meeting Answer citation 不属于当前检索上下文");
  });

  it("treats exhausted structured-output validation as terminal", async () => {
    const agent = {
      generate: vi.fn().mockResolvedValue({ object: { invalid: true }, text: "" }),
    };
    const terminalFailure = await generateMeetingAnswer(
      {
        intelligence: null,
        notes: [],
        previous: [],
        question: "谁负责支付系统迁移？",
        turns,
      },
      agent,
    ).catch((error: Error) => error);
    expect(isMeetingAnswerTerminalError(terminalFailure)).toBe(true);
  });
});
