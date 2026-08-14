import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/client/api";
import { getCreatedMeetingFeishuFailure } from "./human-interview-feishu-error";

describe("getCreatedMeetingFeishuFailure", () => {
  it("recognizes a persisted meeting whose Feishu sync failed", () => {
    const error = new ApiError("飞书日程创建失败", {
      payload: {
        error: "飞书日程创建失败",
        feishuStatus: "failed",
        meetingId: "meeting_123",
      },
      status: 502,
    });

    expect(getCreatedMeetingFeishuFailure(error)).toEqual({
      meetingId: "meeting_123",
      status: "failed",
    });
  });

  it("does not treat an ordinary API error as a partially successful creation", () => {
    const error = new ApiError("参数无效", {
      payload: { error: "参数无效" },
      status: 400,
    });

    expect(getCreatedMeetingFeishuFailure(error)).toBeNull();
    expect(getCreatedMeetingFeishuFailure(new Error("network error"))).toBeNull();
  });
});
