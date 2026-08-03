// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResumeLibraryMetrics } from "@arc/shared/studio-resumes";
import { enableReactActEnvironment, renderInAct, unmountInAct } from "@/test-utils/react-act";
import { ResumeLibraryMetricsSection } from "./resume-library-metrics-section";

const chartMockState = vi.hoisted(() => ({ shouldThrow: false }));

vi.mock("./resume-library-charts", async () => {
  const React = await import("react");
  return {
    ResumeLibraryCharts: ({ metrics }: { metrics: ResumeLibraryMetrics }) => {
      if (chartMockState.shouldThrow) {
        throw new Error("chart render failed");
      }
      return React.createElement(
        "div",
        { "data-testid": "metrics-charts" },
        `${metrics.conversion.withInterview}/${metrics.conversion.withoutInterview}`,
      );
    },
  };
});

enableReactActEnvironment();

const roots: Awaited<ReturnType<typeof renderInAct>>["root"][] = [];

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
  it("lets the page own one initial loading boundary for metrics and records", () => {
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

    expect(pageSource).toContain("resumeLibraryListQuery.isPending && metricsQuery.isPending");
    expect(pageSource).toContain("return <RecruitingPageSkeleton />");
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
    expect(loadingRegion?.querySelector('[data-slot="skeleton"]')).not.toBeNull();
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

    expect(document.querySelector("[data-testid='metrics-charts']")).not.toBeNull();
    expect(document.querySelector("[role='alert']")).toBeNull();
  });

  it("keeps chart render failures inside the metrics region", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    chartMockState.shouldThrow = true;
    const retry = Promise.withResolvers<boolean>();
    const onRetry = vi.fn(() => retry.promise);
    const { root } = await renderInAct(
      <ResumeLibraryMetricsSection error={null} metrics={metrics} onRetry={onRetry} />,
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
      retry.resolve(true);
      await retry.promise;
    });
    expect(document.querySelector("[data-testid='metrics-charts']")).not.toBeNull();
  });
});
