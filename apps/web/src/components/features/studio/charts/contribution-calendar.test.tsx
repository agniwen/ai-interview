// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContributionCalendar } from "./contribution-calendar";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  vi.useRealTimers();
});

describe("ContributionCalendar", () => {
  it("keeps the full-year profile chart compact instead of filling the whole card", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T04:00:00.000Z"));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ContributionCalendar dailyAdded={[{ count: 1, day: "2026-08-30" }]} unitLabel="份" />,
      );
      await Promise.resolve();
    });

    const chart = container.querySelector<HTMLElement>('[data-slot="chart"]');
    expect(chart?.style.width).toBe("648px");
    expect(chart?.style.height).toBe("110px");
    expect(chart?.className).toContain("mx-auto");

    act(() => root.unmount());
    container.remove();
  });
});
