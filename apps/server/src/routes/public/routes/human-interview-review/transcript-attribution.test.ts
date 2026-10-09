import { describe, expect, it } from "vitest";
import { buildAttributionCorrection } from "./transcript-attribution";

const turn = {
  attribution: {
    method: "unconfirmed" as const,
    participantIdentity: null,
    role: "unknown" as const,
    sourceId: "mixed",
  },
  confidence: null,
  endMs: 200,
  id: "turn-1",
  speakerDisplayName: "待确认",
  speakerKey: "remote-1" as const,
  startMs: 100,
  text: "测试回答",
  track: "remote" as const,
};

describe("human interview attribution confirmation", () => {
  it("changes only the explicitly confirmed segment, preserving text and timeline", () => {
    const result = buildAttributionCorrection(
      [turn, { ...turn, endMs: 400, id: "turn-2", startMs: 300 }],
      [{ role: "candidate", turnId: "turn-1" }],
    );
    expect(result?.turns[0]).toMatchObject({
      speakerDisplayName: "候选人",
      startMs: 100,
      text: turn.text,
    });
    expect(result?.turns[1]?.speakerDisplayName).toBe("待确认");
    expect(result?.confirmedRoles).toEqual({ "turn-1": "candidate" });
  });
  it("rejects foreign turn IDs and duplicate assignments", () => {
    expect(
      buildAttributionCorrection([turn], [{ role: "candidate", turnId: "foreign" }]),
    ).toBeNull();
    expect(
      buildAttributionCorrection(
        [turn],
        [
          { role: "candidate", turnId: "turn-1" },
          { role: "interviewer", turnId: "turn-1" },
        ],
      ),
    ).toBeNull();
  });
});
