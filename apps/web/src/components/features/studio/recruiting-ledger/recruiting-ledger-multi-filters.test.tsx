// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecruitingLedgerMultiFilters } from "./recruiting-ledger-multi-filters";

// SAFETY: React's test runtime reads this optional global flag to enforce act boundaries.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function renderFilters(
  filterKeys?: Parameters<typeof RecruitingLedgerMultiFilters>[0]["filterKeys"],
) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RecruitingLedgerMultiFilters
        departments={[]}
        filterKeys={filterKeys}
        jobs={[]}
        mode="records"
        onChange={vi.fn()}
        recruiters={[]}
        value={{}}
      />,
    ),
  );
  return { host, root };
}

describe("recruiting ledger multi filters", () => {
  it("renders only the requested filter group", () => {
    const { host, root } = renderFilters(["responsibleHrId", "recommendationLevel"]);
    try {
      expect(host.querySelector('[aria-label="搜索 HR"]')).not.toBeNull();
      expect(host.querySelector('[aria-label="搜索 AI 评价"]')).not.toBeNull();
      expect(host.querySelector('[aria-label="搜索部门"]')).toBeNull();
      expect(host.querySelector('[aria-label="搜索岗位"]')).toBeNull();
      expect(host.querySelector('[aria-label="搜索岗位状态"]')).toBeNull();
    } finally {
      act(() => root.unmount());
    }
  });

  it("renders no filter when the requested group is empty", () => {
    const { host, root } = renderFilters([]);
    try {
      expect(host.querySelectorAll("input")).toHaveLength(0);
    } finally {
      act(() => root.unmount());
    }
  });
});
