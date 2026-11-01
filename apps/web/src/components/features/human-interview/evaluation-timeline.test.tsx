// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EvaluationTimeline } from "./evaluation-timeline";
import { CandidateInterviewHistory } from "./candidate-interview-history";

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});

// SAFETY: React's test-only act flag is intentionally attached to the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  root = undefined;
  document.body.innerHTML = "";

  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderTimeline() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const onNavigate = vi.fn();
  await act(() =>
    root?.render(
      <EvaluationTimeline
        entries={[
          { author: "面试官甲", id: "latest", outcome: "待定", title: "业务二面" },
          { author: "面试官乙", id: "earlier", outcome: "通过", title: "业务一面" },
        ]}
        onNavigate={onNavigate}
      >
        {() => (
          <>
            <div data-evaluation-id="latest">第二轮详情</div>
            <div data-evaluation-id="earlier">第一轮详情</div>
          </>
        )}
      </EvaluationTimeline>,
    ),
  );
  const viewport = host.querySelector<HTMLElement>('[aria-label="评价详情"]');
  if (!viewport) {
    throw new Error("Missing details viewport");
  }
  const scrollTo = vi.fn();
  viewport.scrollTo = scrollTo;
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 100, 600, 400));
  const latest = host.querySelector('[data-evaluation-id="latest"]');
  const earlier = host.querySelector('[data-evaluation-id="earlier"]');
  if (!latest || !earlier) {
    throw new Error("Missing round content");
  }
  vi.spyOn(latest, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 100, 600, 500));
  vi.spyOn(earlier, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 600, 600, 500));
  return { earlier, host, onNavigate, scrollTo, viewport };
}

describe("evaluation timeline", () => {
  it("opens the selected round, scrolls within the details pane, and updates the active timeline entry", async () => {
    const { host, onNavigate, scrollTo } = await renderTimeline();
    vi.useFakeTimers();
    const button = [...host.querySelectorAll<HTMLButtonElement>("nav button")].find((item) =>
      item.textContent?.includes("业务一面"),
    );
    if (!button) {
      throw new Error("Missing timeline button");
    }
    await act(async () => {
      button.click();
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(onNavigate).toHaveBeenCalledWith("earlier");
    expect(scrollTo).toHaveBeenCalledWith({ behavior: "instant", top: 500 });
    expect(host.querySelector("header")).toBeNull();
    expect(button.getAttribute("aria-current")).toBe("step");
  });

  it("keeps the active timeline entry in sync when the reader scrolls", async () => {
    const { host, viewport, earlier } = await renderTimeline();
    vi.mocked(earlier.getBoundingClientRect).mockReturnValue(new DOMRect(0, 110, 600, 500));
    act(() => viewport.dispatchEvent(new Event("scroll")));
    expect(host.querySelector('nav [aria-current="step"]')?.textContent).toContain("业务一面");
  });

  it("preserves the original collapsible card list on mobile without timeline controls", async () => {
    vi.stubGlobal("innerWidth", 390);
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(() =>
      root?.render(
        <CandidateInterviewHistory
          aiEvaluation={<p>AI 评价内容</p>}
          data={{ hrInitialInformation: null, previousEvaluations: [] }}
        />,
      ),
    );
    expect(host.querySelector('nav[aria-label="评价时间线"]')).toBeNull();
    expect(host.querySelector("header")).toBeNull();
    expect(host.querySelector("select")).toBeNull();
    const trigger = host.querySelector<HTMLButtonElement>("button[aria-expanded]");
    if (!trigger) {
      throw new Error("Missing accordion trigger");
    }
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    act(() => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    act(() => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(host.textContent).toContain("AI 评价内容");
  });
});
