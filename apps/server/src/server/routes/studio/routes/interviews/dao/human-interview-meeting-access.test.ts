import { describe, expect, it } from "vitest";
import { isHumanInterviewMeetingBeforeScheduledStart } from "./human-interview-meeting-access";

describe("真人会议提前入会窗口", () => {
  it.each([
    { blocked: true, now: "2026-09-18T06:44:59.999Z" },
    { blocked: false, now: "2026-09-18T06:45:00.000Z" },
    { blocked: false, now: "2026-09-18T06:50:00.000Z" },
    { blocked: false, now: "2026-09-18T07:00:00.000Z" },
  ])("15:00 的会议在 $now 是否阻止入会：$blocked", ({ now, blocked }) => {
    expect(isHumanInterviewMeetingBeforeScheduledStart("2026-09-18T07:00:00.000Z", now)).toBe(
      blocked,
    );
  });

  it("没有预约时间时不增加入会等待", () => {
    expect(isHumanInterviewMeetingBeforeScheduledStart(null)).toBe(false);
  });
});
