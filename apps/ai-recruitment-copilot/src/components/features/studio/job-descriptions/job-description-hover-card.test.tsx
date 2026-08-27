// @vitest-environment jsdom

import type { JobDescriptionRecord } from "@arc/shared/job-descriptions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JobDescriptionHoverCardView } from "./job-description-hover-card";

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchDetailMock = vi.fn();
const getRevealState = () =>
  document.body.querySelector<HTMLElement>('[data-slot="skeleton-reveal"]')?.dataset.state;

// SAFETY: This test constructs the value with the asserted contract before this boundary.
const record = {
  code: "DEV0001",
  description: "负责产品前端研发",
  evaluationMode: "structured",
  id: "job-1",
  interviewerIds: ["interviewer-1"],
  name: "前端工程师",
  prompt: "熟悉 **React** 与 TypeScript",
} as JobDescriptionRecord;

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("JobDescriptionHoverCard", () => {
  it("loads job details only after the preview opens", async () => {
    const detail = Promise.withResolvers<JobDescriptionRecord>();
    fetchDetailMock.mockReturnValue(detail.promise);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <JobDescriptionHoverCardView
            dependencies={{ fetchDetail: fetchDetailMock, slug: "demo" }}
            jobDescriptionId="job-1"
            name="前端工程师"
          />
        </QueryClientProvider>,
      );
    });

    expect(fetchDetailMock).not.toHaveBeenCalled();
    const trigger = host.querySelector("button");
    expect(trigger?.className).not.toMatch(/(^|\s)underline(\s|$)/);
    expect(trigger?.className).toContain("hover:underline");

    act(() => {
      trigger?.click();
    });

    await vi.waitFor(() => {
      expect(fetchDetailMock).toHaveBeenCalledTimes(1);
    });
    expect(getRevealState()).toBe("loading");
    expect(
      document.body.querySelector('[data-slot="job-description-preview-skeleton"]'),
    ).not.toBeNull();

    await act(async () => {
      detail.resolve(record);
      await detail.promise;
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("岗位 JD");
      expect(document.body.textContent).not.toContain("负责产品前端研发");
      expect(document.body.querySelector('[data-slot="hover-card-content"]')?.classList).toContain(
        "bg-background",
      );
      const scrollAreas = document.body.querySelectorAll('[data-slot="scroll-area"]');
      expect(scrollAreas).toHaveLength(1);
      expect(scrollAreas[0]?.classList).toContain("[--scroll-fade-reveal:1rem]");
      for (const scrollArea of scrollAreas) {
        expect(scrollArea.firstElementChild?.classList).toContain("scroll-fade");
      }
      expect(document.body.querySelector("strong")?.textContent).toBe("React");
      expect(getRevealState()).toBe("revealed");
    });

    act(() => root.unmount());
  });
});
