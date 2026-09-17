// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResumeLibraryMetrics } from "@app/shared/studio-resumes";
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

  it("matches the compact submenu card height while metrics are loading", async () => {
    const { root } = await renderInAct(
      <ResumeLibraryMetricsSection
        error={null}
        fixedRecruitingGroup="offer"
        metrics={undefined}
        onRetry={vi.fn(async () => {})}
      />,
    );
    roots.push(root);

    const cardBodies = document.querySelectorAll<HTMLElement>(
      '[data-slot="metrics-card-body-skeleton"]',
    );
    expect(cardBodies).toHaveLength(2);
    for (const cardBody of cardBodies) {
      expect(cardBody.className).toContain("h-[208px]");
      expect(cardBody.className).not.toContain("h-[260px]");
    }
  });

  it("keeps only the stage distribution and status-share cards for a submenu", async () => {
    const submenuMetrics: ResumeLibraryMetrics = {
      boardStatusCounts: [
        { count: 2, label: "流水提供", view: "offer:income" },
        { count: 3, label: "谈薪", view: "offer:negotiating" },
        { count: 4, label: "发 Offer", view: "offer:send" },
        { count: 1, label: "背调", view: "offer:background" },
      ],
      byPipeline: [{ count: 10, outcome: "in_pipeline", stage: "offer" }],
      conversion: { withInterview: 0, withoutInterview: 0 },
      dailyAdded: [],
    };
    const { root } = await renderInAct(
      <ResumeLibraryMetricsSection
        error={null}
        fixedRecruitingGroup="offer"
        metrics={submenuMetrics}
        onRetry={vi.fn(async () => {})}
      />,
    );
    roots.push(root);

    const firstCard = document.querySelector<HTMLElement>('[data-slot="card"]');
    expect(document.body.textContent).toContain("Offer协商 · 流程分布");
    expect(document.body.textContent).toContain("Offer协商状态占比");
    expect(document.body.textContent).toContain("发 Offer4 · 40%");
    expect(firstCard?.textContent).toContain("流水提供2");
    expect(firstCard?.textContent).toContain("谈薪3");
    expect(firstCard?.textContent).toContain("发 Offer4");
    expect(firstCard?.textContent).toContain("背调1");
    expect(firstCard?.textContent).not.toContain("简历筛选");
    expect(document.body.textContent).not.toContain("入库排行榜");
    expect(document.body.textContent).not.toContain("AI 面试转化");
    const cardBodies = document.querySelectorAll<HTMLElement>(
      '[data-slot="card"] [data-slot="scroll-area"]',
    );
    expect(cardBodies).toHaveLength(2);
    for (const cardBody of cardBodies) {
      expect(cardBody.className).toContain("h-[208px]");
      expect(cardBody.className).not.toContain("h-[260px]");
    }
  });

  it("uses the top-level recruiting stages for the main board distribution", async () => {
    const mainMetrics: ResumeLibraryMetrics = {
      byPipeline: [
        { count: 5, outcome: "in_pipeline", stage: "screening" },
        { count: 4, outcome: "in_pipeline", stage: "ai_interview" },
        { count: 3, outcome: "in_pipeline", stage: "offer" },
        { count: 2, outcome: "in_pipeline", stage: "onboarding" },
        { count: 1, outcome: "hired", stage: "closed" },
      ],
      conversion: { withInterview: 4, withoutInterview: 11 },
      dailyAdded: [],
    };
    const { root } = await renderInAct(
      <ResumeLibraryMetricsSection
        error={null}
        metrics={mainMetrics}
        onRetry={vi.fn(async () => {})}
      />,
    );
    roots.push(root);

    const firstCard = document.querySelector<HTMLElement>('[data-slot="card"]');
    expect(firstCard?.textContent).toContain("招聘流程分布");
    expect(firstCard?.textContent).toContain("简历筛选5");
    expect(firstCard?.textContent).toContain("面试4");
    expect(firstCard?.textContent).toContain("Offer协商3");
    expect(firstCard?.textContent).toContain("入职办理2");
    expect(firstCard?.textContent).toContain("已结束1");
    expect(firstCard?.textContent).not.toContain("复试 / 终试");
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
