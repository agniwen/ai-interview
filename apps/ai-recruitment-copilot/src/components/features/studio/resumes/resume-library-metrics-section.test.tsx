// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enableReactActEnvironment, renderInAct, unmountInAct } from "@/test-utils/react-act";
import { ResumeLibraryMetricsSection } from "./resume-library-metrics-section";

const mocks = vi.hoisted(() => ({
  fetchMetrics: vi.fn(),
}));

vi.mock("@/lib/client/api/endpoints/studio-resumes", () => ({
  fetchStudioResumeMetrics: mocks.fetchMetrics,
}));

vi.mock("@/lib/client/workspace-context", () => ({
  useWorkspaceSlug: () => "acme",
}));

vi.mock("./resume-library-charts", async () => {
  const React = await import("react");
  return {
    ResumeLibraryCharts: ({
      metrics,
    }: {
      metrics: { conversion: { withInterview: number; withoutInterview: number } };
    }) =>
      React.createElement(
        "div",
        { "data-testid": "metrics-charts" },
        `${metrics.conversion.withInterview}/${metrics.conversion.withoutInterview}`,
      ),
  };
});

enableReactActEnvironment();

const roots: Awaited<ReturnType<typeof renderInAct>>["root"][] = [];

afterEach(async () => {
  for (const root of roots) {
    await unmountInAct(root);
  }
  roots.length = 0;
  mocks.fetchMetrics.mockReset();
  document.body.innerHTML = "";
});

function renderMetrics() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return renderInAct(
    <QueryClientProvider client={queryClient}>
      <ResumeLibraryMetricsSection />
    </QueryClientProvider>,
  );
}

describe("ResumeLibraryMetricsSection", () => {
  it("keeps the chart area local to its Suspense fallback while metrics load", async () => {
    const metricsRequest = Promise.withResolvers<{
      byPipeline: never[];
      conversion: { withInterview: number; withoutInterview: number };
      dailyAdded: never[];
    }>();
    mocks.fetchMetrics.mockReturnValue(metricsRequest.promise);

    const { root } = await renderMetrics();
    roots.push(root);

    expect(document.querySelector("[aria-label='招聘指标加载中']")).not.toBeNull();
    expect(mocks.fetchMetrics).toHaveBeenCalledWith("acme");

    await act(async () => {
      metricsRequest.resolve({
        byPipeline: [],
        conversion: { withInterview: 4, withoutInterview: 6 },
        dailyAdded: [],
      });
      await Promise.resolve();
    });

    expect(document.querySelector("[data-testid='metrics-charts']")?.textContent).toBe("4/6");
    expect(document.querySelector("[aria-label='招聘指标加载中']")).toBeNull();
  });

  it("shows a local retry action instead of failing the whole route", async () => {
    mocks.fetchMetrics
      .mockRejectedValueOnce(new Error("metrics unavailable"))
      .mockResolvedValueOnce({
        byPipeline: [],
        conversion: { withInterview: 1, withoutInterview: 2 },
        dailyAdded: [],
      });

    const { root } = await renderMetrics();
    roots.push(root);

    await act(async () => {
      await Promise.resolve();
    });

    const retryButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "重试",
    );
    expect(document.querySelector("[role='alert']")).not.toBeNull();

    await act(async () => {
      retryButton?.click();
      await Promise.resolve();
    });

    expect(document.querySelector("[data-testid='metrics-charts']")?.textContent).toBe("1/2");
  });
});
