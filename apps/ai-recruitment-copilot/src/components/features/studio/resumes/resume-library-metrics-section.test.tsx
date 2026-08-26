// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResumeLibraryMetrics } from "@arc/shared/studio-resumes";
import { enableReactActEnvironment, renderInAct, unmountInAct } from "@/test-utils/react-act";
import { ResumeLibraryMetricsSection } from "./resume-library-metrics-section";

const chartMockState = { shouldThrow: false };
// Test-only renderer seam keeps chart failures local to this section.
const renderCharts = (input: ResumeLibraryMetrics) => {
  if (chartMockState.shouldThrow) {
    throw new Error("chart render failed");
  }
  return (
    <div data-testid="metrics-charts">
      {input.conversion.withInterview}/{input.conversion.withoutInterview}
    </div>
  );
};

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
  chartMockState.shouldThrow = false;
  vi.restoreAllMocks();
});

const metrics: ResumeLibraryMetrics = {
  byPipeline: [],
  conversion: { withInterview: 4, withoutInterview: 6 },
  dailyAdded: [],
};

describe("ResumeLibraryMetricsSection", () => {
  it("lets metrics and records reveal independently without replacing the page shell", () => {
    const pageSource = readFileSync(
      path.join(import.meta.dirname, "resume-library-page.tsx"),
      "utf-8",
    );
    const routeSource = readFileSync(
      path.join(import.meta.dirname, "../../../../routes/w.$slug.studio.resumes.tsx"),
      "utf-8",
    );
    const sectionSource = readFileSync(
      path.join(import.meta.dirname, "resume-library-metrics-section.tsx"),
      "utf-8",
    );

    const queriesSource = readFileSync(
      path.join(import.meta.dirname, "use-resume-library-page-queries.ts"),
      "utf-8",
    );
    const listSource = readFileSync(
      path.join(import.meta.dirname, "resume-library-page-list.tsx"),
      "utf-8",
    );
    expect(queriesSource).not.toContain(
      "resumeLibraryListQuery.isPending && metricsQuery.isPending",
    );
    expect(pageSource).not.toContain("return <RecruitingPageSkeleton />");
    expect(listSource).toContain("<SkeletonReveal");
    expect(listSource).toContain("shouldShowResumeLibraryLoadingState");
    expect(listSource).toContain("isRefetching");
    expect(routeSource).not.toContain("pendingComponent:");
    expect(sectionSource).not.toContain("useSuspenseQuery");
    expect(sectionSource).not.toContain("ClientOnly");
  });

  it("renders metrics supplied by the page query", async () => {
    const { root } = await renderInAct(
      <ResumeLibraryMetricsSection
        error={null}
        metrics={metrics}
        onRetry={vi.fn(async () => {})}
        renderCharts={renderCharts}
      />,
    );
    roots.push(root);

    expect(document.querySelector("[data-testid='metrics-charts']")?.textContent).toBe("4/6");
  });

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
        renderCharts={renderCharts}
      />
    );
    const { root } = await renderInAct(renderSection());
    roots.push(root);

    expect(getRevealState()).toBe("loading");

    await act(async () => {
      root.render(renderSection(metrics));
      await Promise.resolve();
    });

    expect(document.querySelector("[data-testid='metrics-charts']")).not.toBeNull();
    expect(getRevealState()).toBe("revealed");

    await act(async () => {
      root.render(renderSection(metrics, true));
      await Promise.resolve();
    });

    expect(document.querySelector("[data-testid='metrics-charts']")).not.toBeNull();
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
        renderCharts={renderCharts}
      />,
    );
    roots.push(root);

    expect(document.querySelector("[data-testid='metrics-charts']")).not.toBeNull();
    expect(document.querySelector("[role='alert']")).toBeNull();
  });

  it("keeps chart render failures inside the metrics region", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    chartMockState.shouldThrow = true;
    const retry = Promise.withResolvers<undefined>();
    const resolveRetry = retry.resolve.bind(null, undefined);
    const onRetry = vi.fn(() => retry.promise);
    const { root } = await renderInAct(
      <ResumeLibraryMetricsSection
        error={null}
        metrics={metrics}
        onRetry={onRetry}
        renderCharts={renderCharts}
      />,
    );
    roots.push(root);

    const retryButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "重试",
    );
    expect(document.querySelector("[role='alert']")).not.toBeNull();

    act(() => retryButton?.click());
    expect(onRetry).toHaveBeenCalledOnce();
    expect(document.querySelector("[role='alert']")).not.toBeNull();

    chartMockState.shouldThrow = false;
    await act(async () => {
      resolveRetry();
      await retry.promise;
    });
    expect(document.querySelector("[data-testid='metrics-charts']")).not.toBeNull();
  });
});
