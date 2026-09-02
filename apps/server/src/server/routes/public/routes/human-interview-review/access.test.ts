import { describe, expect, it } from "vitest";
import { resolveHumanInterviewReviewMutationAccess } from "./access";

describe("human interview review mutation access", () => {
  it("keeps observers read-only even after the meeting ended", () => {
    expect(
      resolveHumanInterviewReviewMutationAccess({ role: "observer", status: "ended" }, "edit"),
    ).toEqual({ message: "旁听者只能查看真人复面内容。", status: 403 });
    expect(
      resolveHumanInterviewReviewMutationAccess({ role: "observer", status: "ended" }, "submit"),
    ).toEqual({ message: "旁听者只能查看真人复面内容。", status: 403 });
  });

  it("allows drafts during the meeting but only submits after it ended", () => {
    expect(
      resolveHumanInterviewReviewMutationAccess(
        { role: "interviewer", status: "in_progress" },
        "edit",
      ),
    ).toBeNull();
    expect(
      resolveHumanInterviewReviewMutationAccess(
        { role: "interviewer", status: "in_progress" },
        "submit",
      ),
    ).toEqual({ message: "请先结束真人复面，再提交本轮评价。", status: 409 });
    expect(
      resolveHumanInterviewReviewMutationAccess({ role: "host", status: "ended" }, "submit"),
    ).toBeNull();
  });

  it("rejects every mutation after the meeting was cancelled", () => {
    expect(
      resolveHumanInterviewReviewMutationAccess({ role: "host", status: "cancelled" }, "edit"),
    ).toEqual({ message: "已取消的真人复面不能修改复核内容。", status: 409 });
  });
});
