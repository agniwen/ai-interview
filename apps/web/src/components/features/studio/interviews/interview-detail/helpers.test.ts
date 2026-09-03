import { describe, expect, it } from "vitest";
import { formatInterviewEndReason } from "./helpers";

describe("formatInterviewEndReason", () => {
  it.each([
    ["candidate_clicked_end", "候选人点击结束"],
    ["candidate_ended_round", "候选人要求结束"],
    ["task_completed", "系统自然结束"],
    ["time_limit", "达到时间上限"],
    ["reconnect_grace_expired", "连接中断结束"],
    ["participant_disconnected", "连接中断结束"],
    ["system_shutdown", "系统错误结束"],
    ["error", "系统错误结束"],
  ])("formats %s", (reason, label) => {
    expect(formatInterviewEndReason({ closeReason: reason })).toBe(label);
  });

  it("does not expose an unexpected raw reason", () => {
    expect(formatInterviewEndReason({ closeReason: "unexpected_provider_reason" })).toBe(
      "其他原因",
    );
    expect(formatInterviewEndReason({})).toBe("未记录");
  });
});
