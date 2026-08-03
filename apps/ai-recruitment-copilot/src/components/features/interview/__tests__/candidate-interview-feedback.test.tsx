// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CandidateInterviewFeedbackPanel } from "../candidate-interview-feedback";

const { mobileViewport } = vi.hoisted(() => ({
  mobileViewport: { value: false },
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mobileViewport.value,
}));

afterEach(() => {
  mobileViewport.value = false;
  document.body.replaceChildren();
});

describe("CandidateInterviewFeedbackPanel", () => {
  it("shows the feedback action until the candidate has submitted", () => {
    const html = renderToStaticMarkup(
      <CandidateInterviewFeedbackPanel feedback={null} onSubmit={vi.fn()} />,
    );

    expect(html).toContain("反馈问题");
    expect(html).toContain("面试过程不太顺利？");
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

    expect(html).toContain("本轮反馈已提交");
    expect(html).toContain("音频");
    expect(html).toContain("网络连接");
    expect(html).toContain("面试过程中声音断断续续，并且发生过一次网络重连。");
    expect(html).not.toContain(">反馈问题<");
  });

  it("lets candidates expand the mobile drawer to full screen", async () => {
    mobileViewport.value = true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    await act(() => {
      root.render(<CandidateInterviewFeedbackPanel feedback={null} onSubmit={vi.fn()} />);
    });
    const feedbackButton = host.querySelector<HTMLButtonElement>("button");
    await act(() => {
      feedbackButton?.click();
    });

    const expandButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="全屏展开反馈面板"]',
    );
    const drawerContent = document.querySelector<HTMLElement>('[data-slot="dialog-content"]');
    expect(expandButton?.getAttribute("aria-expanded")).toBe("false");
    expect(drawerContent?.className).toContain("md:max-w-xl");
    expect(drawerContent?.className).not.toContain("sm:max-w-xl");
    expect(drawerContent?.className).not.toContain("h-dvh");

    await act(() => {
      expandButton?.click();
    });
    expect(
      document
        .querySelector<HTMLButtonElement>('button[aria-label="收起反馈面板"]')
        ?.getAttribute("aria-expanded"),
    ).toBe("true");
    expect(drawerContent?.className).toContain("h-dvh");
    expect(drawerContent?.className).toContain("rounded-none");

    await act(() => {
      root.unmount();
    });
  });
});
