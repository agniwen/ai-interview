import { describe, expect, it } from "vitest";
import { buildHumanInterviewMeetingTitle } from "./human-interview-stage-utils";

describe("buildHumanInterviewMeetingTitle", () => {
  it("includes the candidate and round label", () => {
    expect(buildHumanInterviewMeetingTitle("张三", "技术复面")).toBe("张三 - 技术复面");
  });
});
