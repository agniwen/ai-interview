import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CandidateInterviewFeedbackPanel } from "../candidate-interview-feedback";

describe("CandidateInterviewFeedbackPanel", () => {
  it("shows the feedback action until the candidate has submitted", () => {
    const html = renderToStaticMarkup(
      <CandidateInterviewFeedbackPanel feedback={null} onSubmit={vi.fn()} />,
    );

    expect(html).toContain("反馈遇到的问题");
    expect(html).not.toContain("已提交反馈");
  });

  it("shows submitted feedback as read-only information", () => {
    const html = renderToStaticMarkup(
      <CandidateInterviewFeedbackPanel
        feedback={{
          categories: ["audio", "network"],
          detail: "面试过程中声音断断续续，并且发生过一次网络重连。",
          submittedAt: "2026-08-03T08:00:00.000Z",
        }}
        onSubmit={vi.fn()}
      />,
    );

    expect(html).toContain("已提交反馈");
    expect(html).toContain("音频");
    expect(html).toContain("网络连接");
    expect(html).toContain("面试过程中声音断断续续，并且发生过一次网络重连。");
    expect(html).not.toContain(">反馈遇到的问题<");
  });
});
