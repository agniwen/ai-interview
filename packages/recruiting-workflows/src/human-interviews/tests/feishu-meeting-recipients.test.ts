import { describe, expect, it } from "vitest";
import {
  resolveFeishuMeetingRecipients,
  selectMeetingFeishuProvider,
} from "../feishu-meeting-recipients";

describe("optional Feishu meeting recipients", () => {
  it("keeps a bound interviewer when an external host has no Feishu account", () => {
    expect(
      resolveFeishuMeetingRecipients(
        [
          { id: "allen", openId: "ou_allen" },
          { id: "external", openId: null },
        ],
        ["allen", "external"],
        "external",
      ),
    ).toEqual({
      interviewerOpenIds: new Map([["allen", "ou_allen"]]),
      ownerOpenId: null,
    });
  });
  it("allows a meeting with no available Feishu recipients", () => {
    expect(
      resolveFeishuMeetingRecipients([{ id: "external", openId: null }], ["external"], "external"),
    ).toEqual({
      interviewerOpenIds: new Map(),
      ownerOpenId: null,
    });
    expect(selectMeetingFeishuProvider([[]])).toBeNull();
  });
  it("still rejects participants outside the workspace", () => {
    expect(() => resolveFeishuMeetingRecipients([], ["unknown"], null)).toThrow("当前工作区");
  });
  it("does not let unbound participants force the default application", () => {
    expect(selectMeetingFeishuProvider([["feishu"], []])).toBe("feishu");
  });
  it("allows mixed applications and preserves an existing calendar provider", () => {
    expect(selectMeetingFeishuProvider([["feishu"], ["feishu-jiguang-hr"]], "feishu")).toBe(
      "feishu",
    );
    expect(selectMeetingFeishuProvider([[]], "feishu")).toBe("feishu");
  });
  it("prefers a common application where one exists", () => {
    expect(selectMeetingFeishuProvider([["feishu", "feishu-jiguang-hr"], ["feishu"], []])).toBe(
      "feishu",
    );
  });
});
