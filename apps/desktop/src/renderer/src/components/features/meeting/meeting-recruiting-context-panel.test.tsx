// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { desktopMeetingKeys } from "@/lib/client/meetings";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeetingRecruitingContextSettings } from "@app/shared/meeting-recording";
import {
  canManageMeetingRecruitingContext,
  MeetingRecruitingContextView,
  MeetingRecruitingContextPanel,
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

  it("shows the linked candidate without redundant guidance", () => {
    const html = renderToStaticMarkup(
      <MeetingRecruitingContextView
        candidates={[]}
        onSelectedIdChange={() => {}}
        selectedId="candidate-79"
        settings={linked}
      />,
    );

    expect(html).toContain("Alice");
    expect(html).toContain("Product Designer");
    expect(html).not.toContain("不会覆盖已有的通用会议洞察");
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

describe("Meeting recruiting selection synchronization", () => {
  it.each(["success", "failure"])(
    "keeps an optimistic unlink until %s settles",
    async (outcome) => {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      });
      const key = desktopMeetingKeys.recruitingContext("workspace", "meeting");
      const settings = { ...linked, canManage: true };
      client.setQueryData(key, settings);
      client.setQueryData(
        desktopMeetingKeys.recruitingContextCandidates("workspace", "meeting", ""),
        [],
      );
      const response = Promise.withResolvers<Response>();
      const refetch = Promise.withResolvers<Response>();
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
        if (init?.method === "PUT") {
          return response.promise;
        }
        if (String(input).includes("/candidates")) {
          return Promise.resolve(Response.json({ records: [] }));
        }
        return refetch.promise;
      });
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      try {
        await act(() =>
          root.render(
            <QueryClientProvider client={client}>
              <MeetingRecruitingContextPanel
                accessRole="owner"
                meetingId="meeting"
                slug="workspace"
              />
            </QueryClientProvider>,
          ),
        );
        const input = container.querySelector("input");
        expect(input?.value).toBe("Alice");
        const clear = container.querySelector<HTMLButtonElement>('button[aria-label="清空"]');
        expect(clear).not.toBeNull();
        await act(() => clear?.click());
        await vi.waitFor(() => expect(input?.disabled).toBe(true));
        expect(input?.value).toBe("");
        expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
          recruitingRecordId: null,
        });
        // An unrelated cache refresh cannot overwrite the optimistic choice while saving.
        await act(() =>
          client.setQueryData(key, {
            ...settings,
            link: settings.link
              ? {
                  ...settings.link,
                  record: { ...settings.link.record, candidateName: "Bob", id: "candidate-80" },
                }
              : null,
          }),
        );
        expect(input?.value).toBe("");
        await act(() =>
          response.resolve(
            Response.json(outcome === "success" ? { state: "updated" } : { error: "保存失败" }, {
              status: outcome === "success" ? 200 : 500,
            }),
          ),
        );
        if (outcome === "success") {
          await vi.waitFor(() =>
            expect(
              fetchSpy.mock.calls.some(
                ([url, init]) => !String(url).includes("/candidates") && init?.method !== "PUT",
              ),
            ).toBe(true),
          );
          expect(input?.disabled).toBe(true);
          expect(input?.value).toBe("");
          await act(() => refetch.resolve(Response.json({ ...settings, link: null })));
        }
        await vi.waitFor(() => expect(input?.disabled).toBe(false));
        expect(input?.value).toBe(outcome === "success" ? "" : "Bob");
        if (outcome === "failure") {
          expect(container.textContent).toContain("保存失败");
        }
      } finally {
        act(() => root.unmount());
        container.remove();
        client.clear();
        fetchSpy.mockRestore();
      }
    },
  );
});
