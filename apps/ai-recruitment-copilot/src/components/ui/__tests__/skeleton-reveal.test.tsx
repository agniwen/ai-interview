// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkeletonReveal } from "../skeleton-reveal";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("SkeletonReveal", () => {
  it("reveals content and replays loading without a reverse transition", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SkeletonReveal loading skeleton={<div>加载占位</div>}>
          <div>真实内容</div>
        </SkeletonReveal>,
      );
    });

    const reveal = container.querySelector<HTMLElement>("[data-slot='skeleton-reveal']");
    const skeleton = container.querySelector<HTMLElement>(
      "[data-slot='skeleton-reveal-placeholder']",
    );
    const content = container.querySelector<HTMLElement>("[data-slot='skeleton-reveal-content']");

    expect(reveal?.dataset.state).toBe("loading");
    expect(reveal?.classList.contains("is-revealed")).toBe(false);
    expect(skeleton?.classList.contains("is-pulsing")).toBe(true);
    expect(content?.getAttribute("aria-hidden")).toBe("true");

    await act(async () => {
      root.render(
        <SkeletonReveal loading={false} skeleton={<div>加载占位</div>}>
          <div>真实内容</div>
        </SkeletonReveal>,
      );
    });

    expect(reveal?.dataset.state).toBe("revealed");
    expect(reveal?.classList.contains("is-revealed")).toBe(true);
    expect(content?.getAttribute("aria-hidden")).toBeNull();

    await act(async () => {
      root.render(
        <SkeletonReveal loading skeleton={<div>加载占位</div>}>
          <div>暂无记录</div>
        </SkeletonReveal>,
      );
    });

    expect(reveal?.dataset.state).toBe("loading");
    expect(reveal?.classList.contains("is-revealed")).toBe(false);
    expect(reveal?.classList.contains("is-resetting")).toBe(true);
    expect(
      container
        .querySelector<HTMLElement>("[data-slot='skeleton-reveal-placeholder']")
        ?.classList.contains("is-pulsing"),
    ).toBe(true);
    expect(content?.getAttribute("aria-hidden")).toBe("true");
    expect(content?.textContent).toBe("暂无记录");

    act(() => root.unmount());
  });

  it("removes the outgoing skeleton after the shared reveal duration", async () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SkeletonReveal loading skeleton={<div>加载占位</div>}>
          <div>真实内容</div>
        </SkeletonReveal>,
      );
    });
    await act(async () => {
      root.render(
        <SkeletonReveal loading={false} skeleton={<div>加载占位</div>}>
          <div>真实内容</div>
        </SkeletonReveal>,
      );
    });

    expect(container.querySelector('[data-slot="skeleton-reveal-placeholder"]')).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(container.querySelector('[data-slot="skeleton-reveal-placeholder"]')).toBeNull();

    act(() => root.unmount());
  });
});
