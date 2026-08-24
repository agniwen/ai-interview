// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResumeLibraryMetrics } from "@arc/shared/studio-resumes";
import { enableReactActEnvironment, renderInAct, unmountInAct } from "@/test-utils/react-act";
import { ResumeLibraryMetricsSection } from "./resume-library-metrics-section";

enableReactActEnvironment();
const roots: Root[] = [];

const metrics: ResumeLibraryMetrics = {
  byPipeline: [],
  conversion: { withInterview: 0, withoutInterview: 0 },
  dailyAdded: [],
};

afterEach(async () => {
  for (const root of roots) {
    await unmountInAct(root);
  }
  roots.length = 0;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("ResumeLibraryMetricsSection refresh state", () => {
  it("keeps the selected ranking period when refreshed metrics update the chart key", async () => {
    const onRetry = vi.fn(async () => {});
    const renderSection = (chartKey: string) => (
      <ResumeLibraryMetricsSection
        chartKey={chartKey}
        error={null}
        metrics={metrics}
        onRetry={onRetry}
      />
    );
    const { root } = await renderInAct(renderSection("team:1"));
    roots.push(root);

    const periodButton = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "今日",
    );
    act(() => periodButton?.click());
    expect(periodButton?.getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      root.render(renderSection("team:2"));
      await Promise.resolve();
    });

    const refreshedPeriodButton = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "今日",
    );
    expect(refreshedPeriodButton?.getAttribute("aria-pressed")).toBe("true");
  });
});
