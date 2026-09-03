// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeetingRecruitingContextSettings } from "@app/shared/meeting-recording";
import {
  canManageMeetingRecruitingContext,
  MeetingRecruitingContextView,
  useDebouncedMeetingRecruitingSearch,
} from "./meeting-recruiting-context-panel";

// SAFETY: The test fixture is constructed with the asserted shape before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const linked: MeetingRecruitingContextSettings = {
  canManage: false,
  link: {
    linkedAt: "2026-08-09T10:30:00.000Z",
    linkedBy: "owner-79",
    record: {
      candidateName: "Alice",
      id: "candidate-79",
      jobDescriptionName: "Product Designer",
      outcome: "in_pipeline",
      pipelineStage: "human_interview",
      targetRole: "Product Designer",
    },
    templateSuggestion: "recruiting-interview",
  },
};

describe("Meeting Recruiting Context panel", () => {
  it("keeps Editors and Viewers read-only while Owner and administrator can manage", () => {
    expect(canManageMeetingRecruitingContext("viewer")).toBe(false);
    expect(canManageMeetingRecruitingContext("editor")).toBe(false);
    expect(canManageMeetingRecruitingContext("owner")).toBe(true);
    expect(canManageMeetingRecruitingContext("administrator")).toBe(true);
  });

  it("shows the linked candidate and a non-destructive Recruiting Interview template suggestion", () => {
    const html = renderToStaticMarkup(
      <MeetingRecruitingContextView
        candidates={[]}
        onSave={() => {}}
        onSelectedIdChange={() => {}}
        selectedId="candidate-79"
        settings={linked}
      />,
    );

    expect(html).toContain("Alice");
    expect(html).toContain("Product Designer");
    expect(html).toContain("招聘面试");
    expect(html).toContain("不会覆盖已有的通用会议洞察");
    expect(html).not.toContain("保存关联");
  });
});

function SearchHarness({
  onSearch,
  search,
}: {
  onSearch: (value: string) => void;
  search: string;
}) {
  const debounced = useDebouncedMeetingRecruitingSearch(search);
  useEffect(() => {
    onSearch(debounced);
  }, [debounced, onSearch]);
  return null;
}

describe("Meeting Recruiting Context search", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("commits only the final value after rapid consecutive input", () => {
    const onSearch = vi.fn();
    act(() => root.render(<SearchHarness onSearch={onSearch} search="" />));
    expect(onSearch).toHaveBeenLastCalledWith("");
    onSearch.mockClear();

    act(() => root.render(<SearchHarness onSearch={onSearch} search="A" />));
    act(() => root.render(<SearchHarness onSearch={onSearch} search="Al" />));
    act(() => root.render(<SearchHarness onSearch={onSearch} search="Ali" />));
    act(() => vi.advanceTimersByTime(249));
    expect(onSearch).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenLastCalledWith("Ali");
  });
});
