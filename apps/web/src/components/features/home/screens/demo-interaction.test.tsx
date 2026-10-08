// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import DemoHumanRoom from "./demo-human-room";
import { DemoCandidateDetail } from "./demo-candidate-detail";
import { DemoProvider, useDemo } from "./demo-context";
import { DemoDialogLayer } from "./demo-dialog";

// SAFETY: React's test-only act flag belongs to the global test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  const demo = useDemo();
  return (
    <>
      <button
        type="button"
        data-open
        onClick={() =>
          demo.setCandidate({
            fields: [{ label: "姓名", value: "真嗣" }],
            id: "01842",
            title: "真嗣 · 候选人详情",
          })
        }
      >
        打开记录
      </button>
      <button type="button" data-finish-ai onClick={() => demo.setPhase("ai-completed")}>
        模拟 AI 完成
      </button>
      {demo.candidate &&
        (demo.phase === "human-live" ? <DemoHumanRoom /> : <DemoCandidateDetail />)}
      <DemoDialogLayer />
    </>
  );
}

it("keeps the identity while showing actual evaluation, round and Offer structures", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient();
  const request = vi.spyOn(globalThis, "fetch");
  const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
  const scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  const pageStyles = [document.body.style.cssText, document.documentElement.style.cssText];
  const expectPageScrollUnlocked = () => {
    expect([document.body.style.cssText, document.documentElement.style.cssText]).toEqual(
      pageStyles,
    );
  };
  vi.stubGlobal("matchMedia", () => ({
    addEventListener: vi.fn(),
    matches: false,
    removeEventListener: vi.fn(),
  }));
  const click = async (selector: string) => {
    const button = container.querySelector<HTMLButtonElement>(selector);
    expect(button, selector).not.toBeNull();
    await act(() => button?.click());
  };
  try {
    await act(() =>
      root.render(
        <QueryClientProvider client={client}>
          <DemoProvider>
            <Harness />
          </DemoProvider>
        </QueryClientProvider>,
      ),
    );
    await click("[data-open]");
    await click('[data-demo-detail-tab="evaluation"]');
    await act(async () => {
      await import("./demo-interview-panels");
    });
    expect(container.textContent).toContain("六维评价");
    expect(container.textContent).toContain("非常推荐");
    await click("[data-demo-launch]");
    expect(container.querySelector('[data-slot="demo-dialog"]')?.textContent).toContain(
      "发起 AI 初面",
    );
    expectPageScrollUnlocked();
    await click("[data-demo-enter-interview]");
    expect(container.querySelector('[data-slot="demo-dialog"]')).toBeNull();
    await click("[data-finish-ai]");
    await click('[data-demo-detail-tab="interviews"]');
    expect(container.textContent).toContain("86 / 100");
    await click("[data-demo-transition-human]");
    expect(container.textContent).toContain("安排真人面试");
    expectPageScrollUnlocked();
    expect(container.querySelector('[data-slot="demo-dialog"] button:disabled')?.textContent).toBe(
      "保存安排",
    );
    await click("[data-demo-dialog-close]");
    await click("[data-demo-enter-human-room]");
    expect(container.querySelector('[data-slot="meeting-grid-layout"]')).not.toBeNull();
    await click("[data-demo-room-materials]");
    expect(container.querySelector('[aria-label="评价时间线"]')).not.toBeNull();
    expect(container.textContent).toContain("AI 初面 · 86 分");
    await click('[aria-label="全屏查看简历"]');
    expect(container.querySelector('[data-slot="demo-dialog"]')?.textContent).toContain(
      "结构化简历",
    );
    expectPageScrollUnlocked();
    expect(container.querySelector('[data-slot="demo-dialog"]')?.textContent).not.toContain(
      "保存安排",
    );
    await click("[data-demo-dialog-close]");
    await click("[data-demo-room-questions]");
    expect(container.querySelector('[aria-label="面试题"]')).not.toBeNull();
    await click("[data-demo-room-review]");
    expect(container.querySelector('[data-slot="meeting-review-panel"]')?.textContent).toContain(
      "我的结论",
    );
    await click("[data-demo-finish-human]");
    await click('[data-demo-detail-tab="human"]');
    expect(container.textContent).toContain("第 1 轮 · 技术复面");
    expect(container.textContent).toContain("评级");
    expect(container.textContent).toContain("通过");
    await click("[data-demo-human-analysis] button[aria-expanded]");
    expect(container.textContent).toContain("完整详细分析");
    expect(scrollIntoView).not.toHaveBeenCalled();
    await click("[data-demo-transition-offer]");
    expect(container.textContent).toContain("Offer 协商进度");
    expect(container.textContent).toContain("34,000");
    expect(
      container.querySelector<HTMLElement>('[data-slot="demo-candidate-detail"]')?.dataset
        .candidateId,
    ).toBe("01842");
    expect(container.querySelector("h1")?.textContent).toBe("真嗣");
    expect(request).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    request.mockRestore();
    if (originalScroll) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScroll);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
    vi.unstubAllGlobals();
    client.clear();
    container.remove();
  }
});
