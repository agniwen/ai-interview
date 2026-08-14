import { describe, expect, it } from "vitest";
import { buildAiCalendarEvents } from "./events";

describe("buildAiCalendarEvents", () => {
  it("shows every completed interview record and suppresses its duplicate scheduled event", () => {
    const events = buildAiCalendarEvents({
      conversationRows: [
        {
          candidateName: "张三",
          conversationId: "conversation-1",
          endedAt: new Date("2026-07-25T02:30:00.000Z"),
          interviewRecordId: "interview-1",
          roundId: "round-1",
          roundLabel: "AI 初面",
          startedAt: new Date("2026-07-25T02:00:00.000Z"),
        },
        {
          candidateName: "张三",
          conversationId: "conversation-2",
          endedAt: new Date("2026-07-26T03:45:00.000Z"),
          interviewRecordId: "interview-1",
          roundId: "round-1",
          roundLabel: "AI 初面",
          startedAt: new Date("2026-07-26T03:00:00.000Z"),
        },
      ],
      scheduledRows: [
        {
          candidateName: "张三",
          interviewRecordId: "interview-1",
          roundId: "round-1",
          roundLabel: "AI 初面",
          scheduledAt: new Date("2026-07-25T02:00:00.000Z"),
          scheduledEndAt: new Date("2026-07-25T03:00:00.000Z"),
          status: "completed",
        },
        {
          candidateName: "李四",
          interviewRecordId: "interview-2",
          roundId: "round-2",
          roundLabel: "AI 复面",
          scheduledAt: new Date("2026-07-27T04:00:00.000Z"),
          scheduledEndAt: new Date("2026-07-27T05:00:00.000Z"),
          status: "pending",
        },
      ],
    });

    expect(events.map((event) => event.id)).toEqual([
      "ai-result:conversation-1",
      "ai-result:conversation-2",
      "ai:round-2",
    ]);
    expect(events[0]).toMatchObject({
      conversationId: "conversation-1",
      endAt: "2026-07-25T02:30:00.000Z",
      source: "result",
      startAt: "2026-07-25T02:00:00.000Z",
      status: "ended",
    });
    expect(events[2]).toMatchObject({
      conversationId: null,
      source: "scheduled",
      status: "scheduled",
    });
  });

  it("suppresses a completed plan when its result is outside the visible date range", () => {
    const events = buildAiCalendarEvents({
      conversationRows: [],
      roundIdsWithResults: ["round-1"],
      scheduledRows: [
        {
          candidateName: "张三",
          interviewRecordId: "interview-1",
          roundId: "round-1",
          roundLabel: "AI 初面",
          scheduledAt: new Date("2026-07-25T02:00:00.000Z"),
          scheduledEndAt: new Date("2026-07-25T03:00:00.000Z"),
          status: "completed",
        },
      ],
    });

    expect(events).toEqual([]);
  });

  it("keeps a new pending plan after an earlier result from the same round", () => {
    const events = buildAiCalendarEvents({
      conversationRows: [],
      roundIdsWithResults: ["round-1"],
      scheduledRows: [
        {
          candidateName: "张三",
          interviewRecordId: "interview-1",
          roundId: "round-1",
          roundLabel: "AI 初面",
          scheduledAt: new Date("2026-07-28T02:00:00.000Z"),
          scheduledEndAt: new Date("2026-07-28T03:00:00.000Z"),
          status: "pending",
        },
      ],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      conversationId: null,
      id: "ai:round-1",
      source: "scheduled",
      status: "scheduled",
    });
  });
});
