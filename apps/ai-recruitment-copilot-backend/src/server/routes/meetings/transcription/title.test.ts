import { describe, expect, it } from "vitest";
import { fallbackMeetingTitleFromTranscript } from "./title";

describe("Meeting transcript title", () => {
  it("uses the first meaningful transcript content as a bounded fallback", () => {
    expect(
      fallbackMeetingTitleFromTranscript({
        language: "zh",
        turns: [
          {
            confidence: null,
            endMs: 1000,
            speakerKey: "local",
            startMs: 0,
            text: " ",
            track: "local",
          },
          {
            confidence: null,
            endMs: 5000,
            speakerKey: "remote-1",
            startMs: 1000,
            text: "讨论第三季度产品发布计划，以及移动端灰度安排。",
            track: "remote",
          },
        ],
      }),
    ).toBe("讨论第三季度产品发布计划，以及移动端灰度安排");
  });
});
