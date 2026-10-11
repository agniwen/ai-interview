import type { PersistedInterviewTurn } from "@app/db-schema/interview-session";
import { describe, expect, it } from "vitest";
import {
  coalescePersistedInterviewTurns,
  countDisplayInterviewTurns,
} from "@app/shared/interview-transcript-turns";

function turn(
  id: string,
  role: PersistedInterviewTurn["role"],
  message: string,
  conversationId = "conversation-1",
): PersistedInterviewTurn {
  return {
    conversationId,
    createdAt: "2026-05-29T00:00:00.000Z",
    id,
    interviewRecordId: "record-1",
    message,
    receivedAt: "2026-05-29T00:00:00.000Z",
    role,
    source: "agent_report",
    timeInCallSecs: null,
  };
}

describe("coalescePersistedInterviewTurns", () => {
  it("merges consecutive user turns from the same conversation", () => {
    const result = coalescePersistedInterviewTurns([
      turn("u1", "user", "最大的成就是在 VLO"),
      turn("u2", "user", "然后把一个视频 SDK 项目"),
      turn("u3", "user", "0 到 1 做到了一万多日活"),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "u1",
      message: "最大的成就是在 VLO 然后把一个视频 SDK 项目 0 到 1 做到了一万多日活",
      rawTurnIndexes: [1, 2, 3],
      role: "user",
    });
  });

  it("keeps evidence indexes stable when an agent turn splits user speech", () => {
    const result = coalescePersistedInterviewTurns([
      turn("u1", "user", "第一段"),
      turn("a1", "agent", "好的"),
      turn("u2", "user", "第二段"),
    ]);

    expect(result.map((item) => item.rawTurnIndexes)).toEqual([[1], [2], [3]]);
    expect(result.map((item) => item.message)).toEqual(["第一段", "好的", "第二段"]);
  });

  it("does not merge consecutive agent turns", () => {
    const result = coalescePersistedInterviewTurns([
      turn("a1", "agent", "追问一"),
      turn("a2", "agent", "追问二"),
    ]);

    expect(result).toHaveLength(2);
  });

  it("counts display turns after user transcript merging", () => {
    const stats = countDisplayInterviewTurns([
      turn("u1", "user", "第一段"),
      turn("u2", "user", "第二段"),
      turn("a1", "agent", "追问"),
      turn("u3", "user", "第三段"),
    ]);

    expect(stats).toEqual({
      agentTurnCount: 1,
      turnCount: 3,
      userTurnCount: 2,
    });
  });
});
