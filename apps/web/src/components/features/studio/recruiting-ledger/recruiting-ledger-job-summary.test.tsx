// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecruitingLedgerJobSummary } from "@app/shared/studio-recruiting-ledger";
import { JobSummaryGrid } from "./recruiting-ledger-job-summary";

// SAFETY: React's test runtime reads this optional global flag to enforce act boundaries.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row: RecruitingLedgerJobSummary = {
  active: 4,
  confirmed: 1,
  departmentName: "研发部",
  gap: 2,
  headcount: 3,
  hired: 1,
  id: "job-1",
  jobPriority: "high",
  jobWeight: "1.00",
  name: "前端工程师",
  negativeClosed: 1,
  processDistribution: { closed: 1, interview: 2, offer: 1, onboarding: 1, screening: 3 },
  recruitingPoints: 1.5,
  recruitingStatus: "active",
  total: 8,
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("job recruiting summary", () => {
  it("shows the full process distribution and opens the selected candidate stage", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onSelectStage = vi.fn();
    try {
      act(() =>
        root.render(
          <JobSummaryGrid onSelect={vi.fn()} onSelectStage={onSelectStage} rows={[row]} />,
        ),
      );

      expect(host.textContent).toContain("筛选 3");
      expect(host.textContent).toContain("面试 2");
      expect(host.textContent).toContain("Offer 1");
      expect(host.textContent).toContain("待入职 1");
      expect(host.textContent).toContain("已结束 1");

      const interviewButton = host.querySelector<HTMLButtonElement>(
        'button[aria-label="查看前端工程师的面试候选人，共 2 人"]',
      );
      act(() => interviewButton?.click());
      expect(onSelectStage).toHaveBeenCalledWith("job-1", "interview:all");
    } finally {
      act(() => root.unmount());
    }
  });
});
