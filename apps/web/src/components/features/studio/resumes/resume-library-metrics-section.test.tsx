// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResumeLibraryMetrics } from "@arc/shared/studio-resumes";
import { enableReactActEnvironment, renderInAct, unmountInAct } from "@/test-utils/react-act";
import { ResumeLibraryMetricsSection } from "./resume-library-metrics-section";

enableReactActEnvironment();

const roots: Awaited<ReturnType<typeof renderInAct>>["root"][] = [];
const getRevealState = () =>
  document.querySelector<HTMLElement>('[data-slot="skeleton-reveal"]')?.dataset.state;

afterEach(async () => {
  for (const root of roots) {
    await unmountInAct(root);
  }
  roots.length = 0;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const metrics: ResumeLibraryMetrics = {
  byPipeline: [],
  conversion: { withInterview: 4, withoutInterview: 6 },
  dailyAdded: [],
};

describe("ResumeLibraryMetricsSection", () => {
  it("keeps the metrics region stable while only metrics are loading", async () => {
    const { root } = await renderInAct(
      <ResumeLibraryMetricsSection
        error={null}
        metrics={undefined}
        onRetry={vi.fn(async () => {})}
      />,
    );
    roots.push(root);

    const loadingRegion = document.querySelector('[aria-label="招聘指标加载中"]');
    expect(loadingRegion).not.toBeNull();
    expect(loadingRegion?.querySelectorAll('[data-slot="metrics-card-skeleton"]')).toHaveLength(3);
    expect(
      loadingRegion?.querySelectorAll('[data-slot="metrics-card-body-skeleton"]'),
    ).toHaveLength(3);
    for (const cardBody of loadingRegion?.querySelectorAll(
      '[data-slot="metrics-card-body-skeleton"]',
    ) ?? []) {
      expect(cardBody.className).toContain("h-[260px]");
    }
    expect(getRevealState()).toBe("loading");
  });

  it("reveals initial metrics once and keeps existing charts revealed during refresh", async () => {
    const onRetry = vi.fn(async () => {});
    const renderSection = (nextMetrics?: ResumeLibraryMetrics, isRefreshing = false) => (
      <ResumeLibraryMetricsSection
        error={null}
        isRefreshing={isRefreshing}
        metrics={nextMetrics}
        onRetry={onRetry}
      />
    );
    const { root } = await renderInAct(renderSection());
    roots.push(root);

    expect(getRevealState()).toBe("loading");

    await act(async () => {
      root.render(renderSection(metrics));
      await Promise.resolve();
    });

    expect(getRevealState()).toBe("revealed");

    await act(async () => {
      root.render(renderSection(metrics, true));
      await Promise.resolve();
    });

    expect(getRevealState()).toBe("revealed");
  });

  it("shows a local retry action instead of failing the whole page", async () => {
    const onRetry = vi.fn(async () => {});
    const { root } = await renderInAct(
      <ResumeLibraryMetricsSection
        error={new Error("metrics unavailable")}
        metrics={undefined}
        onRetry={onRetry}
      />,
    );
    roots.push(root);

    const retryButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "重试",
    );
    expect(document.querySelector("[role='alert']")).not.toBeNull();

    act(() => retryButton?.click());
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("keeps existing metrics visible when a background refresh fails", async () => {
    const { root } = await renderInAct(
      <ResumeLibraryMetricsSection
        error={new Error("refresh failed")}
        metrics={metrics}
        onRetry={vi.fn(async () => {})}
      />,
    );
    roots.push(root);

    expect(document.querySelector("[role='alert']")).toBeNull();
  });
});
