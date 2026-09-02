import { describe, expect, it } from "vitest";
import {
  buildHumanInterviewMeetingTitle,
  canCompleteHumanInterviewRound,
  getHumanInterviewBusinessRoundNumbers,
  getHumanInterviewScheduleBlockReason,
} from "./human-interview-stage-utils";

describe("canCompleteHumanInterviewRound", () => {
  it("does not expose the retired direct-completion action after a meeting ends", () => {
    expect(canCompleteHumanInterviewRound({ status: "pending" }, { status: "ended" })).toBe(false);
  });
});

describe("buildHumanInterviewMeetingTitle", () => {
  it("includes the candidate and round label", () => {
    expect(buildHumanInterviewMeetingTitle("张三", "技术复面")).toBe("张三 - 技术复面");
    expect(buildHumanInterviewMeetingTitle("张三", "CEO面试")).toBe("张三 - CEO面试");
  });
});

describe("getHumanInterviewBusinessRoundNumbers", () => {
  it("starts human interviews at round two and does not consume a round when cancelled", () => {
    const numbers = getHumanInterviewBusinessRoundNumbers([
      { id: "cancelled-attempt", outcome: null, status: "cancelled" },
      { id: "active-retry", outcome: null, status: "pending" },
    ]);

    expect(numbers.get("cancelled-attempt")).toBe(2);
    expect(numbers.get("active-retry")).toBe(2);
  });

  it("advances only after a human interview is completed and passed", () => {
    const numbers = getHumanInterviewBusinessRoundNumbers([
      { id: "business-first", outcome: "pass", status: "completed" },
      { id: "business-second", outcome: null, status: "pending" },
    ]);

    expect(numbers.get("business-first")).toBe(2);
    expect(numbers.get("business-second")).toBe(3);
  });

  it("does not advance after failed or inconclusive results", () => {
    const numbers = getHumanInterviewBusinessRoundNumbers([
      { id: "failed", outcome: "fail", status: "completed" },
      { id: "inconclusive", outcome: "inconclusive", status: "completed" },
      { id: "next", outcome: null, status: "pending" },
    ]);

    expect(numbers.get("failed")).toBe(2);
    expect(numbers.get("inconclusive")).toBe(2);
    expect(numbers.get("next")).toBe(2);
  });
});

describe("getHumanInterviewScheduleBlockReason", () => {
  it("blocks a new round while the current round is pending", () => {
    expect(
      getHumanInterviewScheduleBlockReason([
        { label: "技术一面", outcome: null, status: "pending" },
      ]),
    ).toContain("标记完成");
  });

  it("blocks failed and inconclusive results but allows pass or cancelled retries", () => {
    expect(
      getHumanInterviewScheduleBlockReason([
        { label: "技术一面", outcome: "fail", status: "completed" },
      ]),
    ).toContain("未通过");
    expect(
      getHumanInterviewScheduleBlockReason([
        { label: "技术一面", outcome: "inconclusive", status: "completed" },
      ]),
    ).toContain("标记为通过");
    expect(
      getHumanInterviewScheduleBlockReason([
        { label: "技术一面", outcome: "pass", status: "completed" },
      ]),
    ).toBeNull();
    expect(
      getHumanInterviewScheduleBlockReason([
        { label: "技术一面", outcome: null, status: "cancelled" },
      ]),
    ).toBeNull();
  });
});
