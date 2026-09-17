import { MediaDeviceFailure } from "livekit-client";
import { describe, expect, it } from "vitest";
import { getMeetingMediaErrorMessage } from "./human-meeting-media-errors";

describe("meeting media error guidance", () => {
  it.each([
    ["NotAllowedError", "未获得媒体权限"],
    ["NotFoundError", "未找到可用设备"],
    ["NotReadableError", "被其他应用占用"],
    ["UnknownError", "检查设备与系统权限"],
  ])("provides actionable feedback for %s", (name, message) => {
    const error = new Error("browser-specific error");
    error.name = name;
    expect(getMeetingMediaErrorMessage(MediaDeviceFailure.getFailure(error))).toContain(message);
  });

  it("provides fallback guidance for unclassified failures", () => {
    expect(getMeetingMediaErrorMessage()).toContain("检查设备与系统权限");
  });
});
