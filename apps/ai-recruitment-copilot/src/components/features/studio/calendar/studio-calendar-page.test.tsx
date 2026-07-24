// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCalendarPage } from "./studio-calendar-page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchStudioCalendarMock = vi.hoisted(() =>
  vi.fn(() => {
    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);
    return Promise.resolve({
      events: [
        {
          candidates: [
            {
              candidateName: "张三",
              interviewRecordId: "interview-1",
              roundId: "round-1",
              roundLabel: "AI 初面",
            },
          ],
          conversationId: "conversation-1",
          endAt: endAt.toISOString(),
          id: "ai-result:conversation-1",
          kind: "ai" as const,
          source: "result" as const,
          startAt: startAt.toISOString(),
          status: "ended" as const,
          title: "AI 初面",
        },
      ],
    });
  }),
);

vi.mock("@/lib/client/api", () => ({
  fetchStudioCalendar: fetchStudioCalendarMock,
}));

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("StudioCalendarPage", () => {
  it("renders the ReUI calendar without a React hook dispatcher error", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <StudioCalendarPage slug="demo" />
        </QueryClientProvider>,
      );
    });

    expect(host.textContent).toContain("日程管理");
    expect(host.querySelector('[data-slot="frame"]')).not.toBeNull();
    expect(host.querySelector('[data-slot="frame-panel"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="正在加载面试日程"]')).not.toBeNull();
    await act(async () => {
      await vi.waitFor(() => {
        expect(host.querySelector('[data-slot="event-calendar"]')).not.toBeNull();
      });
    });
    expect(host.textContent).toContain("张三 · AI 初面");
    expect(host.querySelectorAll('[data-slot="tabs-tab"]')).toHaveLength(3);

    const pendingCalendar = Promise.withResolvers<{ events: never[] }>();
    fetchStudioCalendarMock.mockImplementationOnce(() => pendingCalendar.promise);
    const monthTab = [...host.querySelectorAll<HTMLElement>('[data-slot="tabs-tab"]')].find(
      (tab) => tab.textContent === "月",
    );
    act(() => monthTab?.click());

    expect(host.querySelector('[aria-label="正在加载面试日程"]')).toBeNull();
    expect(host.querySelector('[data-slot="event-calendar"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-slot="tabs-tab"]')).toHaveLength(3);

    act(() => root.unmount());
  });
});
