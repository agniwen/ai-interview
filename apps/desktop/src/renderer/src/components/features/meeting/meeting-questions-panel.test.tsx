import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MeetingQuestionThread } from "@app/shared/meeting-answer";
import {
  hasActiveMeetingQuestion,
  meetingAnswerSeekSeconds,
  MeetingQuestionThreadView,
} from "./meeting-questions-panel";

const thread: MeetingQuestionThread = {
  createdAt: "2026-08-09T12:00:00.000Z",
  exchanges: [
    {
      answer: {
        citations: [{ endMs: 8000, startMs: 2500, turnId: "turn-81" }],
        kind: "answer",
        text: "候选人负责支付系统迁移。",
      },
      answeredAt: "2026-08-09T12:01:00.000Z",
      createdAt: "2026-08-09T12:00:30.000Z",
      error: null,
      id: "exchange-81",
      question: "谁负责支付系统迁移？",
      requestId: "00000000-0000-4000-8000-000000000081",
      sequence: 1,
      status: "ready",
    },
    {
      answer: {
        citations: [],
        kind: "insufficient-evidence",
        text: "当前会议资料中没有足够证据回答这个问题。",
      },
      answeredAt: "2026-08-09T12:02:00.000Z",
      createdAt: "2026-08-09T12:01:30.000Z",
      error: null,
      id: "exchange-82",
      question: "预算是多少？",
      requestId: "00000000-0000-4000-8000-000000000082",
      sequence: 2,
      status: "ready",
    },
  ],
  id: "thread-81",
  meetingId: "meeting-81",
  title: "项目经验",
  updatedAt: "2026-08-09T12:02:00.000Z",
};

describe("Meeting Questions panel", () => {
  it("renders grounded answers, playable citations, and explicit insufficient evidence", () => {
    const html = renderToStaticMarkup(
      <MeetingQuestionThreadView onSeek={vi.fn()} thread={thread} />,
    );
    expect(html).toContain("候选人负责支付系统迁移");
    expect(html).toContain("证据 00:02");
    expect(html).toContain("证据不足");
    expect(html).toContain("当前会议资料中没有足够证据");
  });

  it("converts citation ranges into the existing playback seek unit", () => {
    expect(meetingAnswerSeekSeconds(2500)).toBe(2.5);
  });

  it("keeps one in-flight question per thread", () => {
    const [firstExchange] = thread.exchanges;
    if (!firstExchange) {
      throw new Error("fixture requires an exchange");
    }
    expect(
      hasActiveMeetingQuestion({
        ...thread,
        exchanges: [{ ...firstExchange, answer: null, status: "processing" }],
      }),
    ).toBe(true);
  });
});
