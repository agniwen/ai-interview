import { describe, expect, it } from "vitest";

import { getAiRoundResetBehavior } from "../pipeline-stage-action-bar";

describe("getAiRoundResetBehavior", () => {
  it("resets a pending round directly", () => {
    expect(getAiRoundResetBehavior("pending")).toBe("direct");
  });

  it("confirms before resetting a completed round", () => {
    expect(getAiRoundResetBehavior("completed")).toBe("confirm");
  });

  it.each(["in_progress", "interrupted"] as const)(
    "disables reset while a round is %s",
    (status) => {
      expect(getAiRoundResetBehavior(status)).toBe("disabled");
    },
  );
});
