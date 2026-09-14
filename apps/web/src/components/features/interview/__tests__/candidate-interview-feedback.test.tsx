// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CandidateInterviewFeedbackPanel } from "../candidate-interview-feedback";

// SAFETY: The jsdom fixture provides the media-query API consumed by use-mobile.
window.matchMedia = ((query: string) => ({
  addEventListener: () => {},
  addListener: () => {},
  dispatchEvent: () => false,
  matches: false,
  media: query,
  onchange: null,
  removeEventListener: () => {},
  removeListener: () => {},
})) as typeof window.matchMedia;

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
}

afterEach(() => {
  setViewportWidth(1024);
  document.body.replaceChildren();
});

const click = async (label: string) => {
  const button = [...document.querySelectorAll("button")].find(
    (element) => element.textContent === label,
  );
  expect(button).toBeDefined();
  await act(() => {
    button?.click();
  });
};

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

    expect(html).toContain("本轮反馈已为您记录");
    expect(html).toContain("音频");
    expect(html).toContain("网络连接");
    expect(html).toContain("面试过程中声音断断续续，并且发生过一次网络重连。");
    expect(html).not.toContain(">反馈问题<");
  });

  it("puts the mobile feedback action above its description without title or media", async () => {
    setViewportWidth(375);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    await act(() => {
      root.render(<CandidateInterviewFeedbackPanel feedback={null} onSubmit={vi.fn()} />);
    });

    const media = host.querySelector<HTMLElement>('[data-slot="item-media"]');
    const title = host.querySelector<HTMLElement>('[data-slot="item-title"]');
    const content = host.querySelector<HTMLElement>('[data-slot="item-content"]');
    const actions = host.querySelector<HTMLElement>('[data-slot="item-actions"]');
    const feedbackButton = host.querySelector<HTMLButtonElement>('[data-slot="button"]');
    expect(media?.className).toContain("hidden");
    expect(title?.className).toContain("hidden");
    expect(actions?.className).toContain("order-1");
    expect(content?.className).toContain("order-2");
    expect(feedbackButton?.dataset.size).toBe("lg");
    expect(feedbackButton?.className).toContain("w-full");
    expect(feedbackButton?.className).toContain("md:w-auto");

    await act(() => {
      root.unmount();
    });
  });

  it("lets candidates expand the mobile drawer to full screen", async () => {
    setViewportWidth(375);
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
  it("restores the round draft, keeps submission visible, and allows retry after failure", async () => {
    const draft = { categories: ["audio"], detail: "面试结束提交反馈之后页面没有反应" };
    sessionStorage.setItem("interview-feedback:round-1", JSON.stringify(draft));
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const { promise: pending, reject: fail } = Promise.withResolvers<undefined>();
    const submit = vi
      .fn()
      .mockReturnValueOnce(pending)
      .mockImplementation(() => Promise.resolve());
    await act(() => {
      root.render(
        <CandidateInterviewFeedbackPanel draftKey="round-1" feedback={null} onSubmit={submit} />,
      );
    });
    await click("反馈问题");
    expect(document.querySelector("textarea")?.value).toBe(draft.detail);
    await click("下一步");
    await click("确认提交");
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("提交中...");
    await act(async () => {
      fail(new Error("结束状态正在同步，请重试"));
      await pending.catch(() => {});
    });
    expect(document.querySelector('[role="alertdialog"] [role="alert"]')?.textContent).toContain(
      "结束状态正在同步",
    );
    expect(sessionStorage.getItem("interview-feedback:round-1")).not.toBeNull();
    await click("确认提交");
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit).toHaveBeenLastCalledWith(draft);
    expect(sessionStorage.getItem("interview-feedback:round-1")).toBeNull();
    await act(() => {
      root.unmount();
    });
  });
});
