// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioCalendarPage } from "./studio-calendar-page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchStudioCalendarMock = vi.hoisted(() =>
  vi.fn(() => {
    const startAt = new Date();
    const dayOfWeek = startAt.getDay() || 7;
    startAt.setDate(startAt.getDate() - (dayOfWeek - 1));
    startAt.setHours(10, 0, 0, 0);
    const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);
    const humanStartAt = new Date();
    humanStartAt.setHours(10, 0, 0, 0);
    const humanEndAt = new Date(humanStartAt.getTime() + 30 * 60 * 1000);
    const endedHumanStartAt = new Date(startAt.getTime() + 3 * 24 * 60 * 60 * 1000);
    const endedHumanEndAt = new Date(endedHumanStartAt.getTime() + 30 * 60 * 1000);
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
          endAt: humanEndAt.toISOString(),
          id: "ai-result:conversation-1",
          kind: "ai" as const,
          source: "result" as const,
          startAt: humanStartAt.toISOString(),
          status: "ended" as const,
          title: "AI 初面",
        },
        {
          candidates: [
            {
              candidateName: "李四",
              interviewRecordId: "interview-2",
              roundId: "round-2",
              roundLabel: "技术复面",
            },
          ],
          endAt: humanEndAt.toISOString(),
          format: "online" as const,
          id: "human:round-2",
          interviewers: [{ id: "user-1", name: "王面试官" }],
          kind: "human" as const,
          location: null,
          meetingUrl: null,
          startAt: humanStartAt.toISOString(),
          status: "scheduled" as const,
          title: "技术复面",
        },
        {
          candidates: [
            {
              candidateName: "王五",
              interviewRecordId: "interview-3",
              roundId: "round-3",
              roundLabel: "AI 复面",
            },
          ],
          conversationId: null,
          endAt: endedHumanEndAt.toISOString(),
          id: "ai:round-3",
          kind: "ai" as const,
          source: "scheduled" as const,
          startAt: endedHumanStartAt.toISOString(),
          status: "scheduled" as const,
          title: "AI 复面",
        },
        {
          candidates: [
            {
              candidateName: "赵六",
              interviewRecordId: "interview-4",
              roundId: "round-4",
              roundLabel: "终面",
            },
          ],
          endAt: endAt.toISOString(),
          format: "offline" as const,
          id: "human:round-4",
          interviewers: [{ id: "user-2", name: "陈面试官" }],
          kind: "human" as const,
          location: "会议室 A",
          meetingUrl: null,
          startAt: startAt.toISOString(),
          status: "ended" as const,
          title: "终面",
        },
      ],
    });
  }),
);

vi.mock("@/lib/client/api", () => ({
  fetchStudioCalendar: fetchStudioCalendarMock,
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-17T09:00:00+08:00"));
});

afterEach(() => {
  vi.useRealTimers();
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
    expect(host.textContent).toContain("李四 · 技术复面");
    expect(host.querySelectorAll('[data-slot="tabs-tab"]')).toHaveLength(3);
    expect(host.querySelector('[data-slot="event-calendar-event-dot"]')).toBeNull();
    expect(host.querySelector('[data-calendar-event-icon="ai"]')).not.toBeNull();
    expect(host.querySelector('[data-calendar-event-icon="human"]')).not.toBeNull();
    const aiEvent = [
      ...host.querySelectorAll<HTMLElement>('[data-slot="event-calendar-event"]'),
    ].find((event) => event.textContent?.includes("张三 · AI 初面"));
    const humanEvent = [
      ...host.querySelectorAll<HTMLElement>('[data-slot="event-calendar-event"]'),
    ].find((event) => event.textContent?.includes("李四 · 技术复面"));
    const pendingAiEvent = [
      ...host.querySelectorAll<HTMLElement>('[data-slot="event-calendar-event"]'),
    ].find((event) => event.textContent?.includes("王五 · AI 复面"));
    const endedHumanEvent = [
      ...host.querySelectorAll<HTMLElement>('[data-slot="event-calendar-event"]'),
    ].find((event) => event.textContent?.includes("赵六 · 终面"));
    expect(aiEvent?.className).toContain("bg-(--ec-event-color)/10");
    expect(aiEvent?.className).toContain(
      "[&_.text-muted-foreground]:text-(--ec-event-foreground)/75",
    );
    expect(humanEvent?.className).toContain("bg-(--ec-event-color)/5");
    expect(aiEvent?.style.getPropertyValue("--ec-event-color")).toBe(
      "var(--calendar-ai-interview)",
    );
    expect(aiEvent?.style.getPropertyValue("--ec-event-foreground")).toBe(
      "var(--calendar-ai-interview-foreground)",
    );
    expect(humanEvent?.style.getPropertyValue("--ec-event-color")).toBe(
      "var(--calendar-human-interview)",
    );
    expect(humanEvent?.style.getPropertyValue("--ec-event-foreground")).toBe(
      "var(--calendar-human-interview-foreground)",
    );
    expect(pendingAiEvent?.className).toContain("bg-(--ec-event-color)/5");
    expect(endedHumanEvent?.className).toContain("bg-(--ec-event-color)/10");
    expect(aiEvent?.getAttribute("aria-label")).toContain("AI 面试记录");
    expect(humanEvent?.getAttribute("aria-label")).toContain("真人面试");
    expect(aiEvent?.dataset.calendarEventPreview).toBe("ai");
    expect(humanEvent?.dataset.calendarEventPreview).toBeUndefined();

    const pendingCalendar = Promise.withResolvers<{ events: never[] }>();
    fetchStudioCalendarMock.mockImplementationOnce(() => pendingCalendar.promise);
    const monthTab = [...host.querySelectorAll<HTMLElement>('[data-slot="tabs-tab"]')].find(
      (tab) => tab.textContent === "月",
    );
    await act(async () => {
      monthTab?.click();
      await Promise.resolve();
    });

    expect(host.querySelector('[aria-label="正在加载面试日程"]')).toBeNull();
    expect(host.querySelector('[data-slot="event-calendar"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-slot="tabs-tab"]')).toHaveLength(3);
    expect(host.querySelectorAll('[data-calendar-event-icon="ai"]')).toHaveLength(2);
    expect(host.querySelectorAll('[data-calendar-event-icon="human"]')).toHaveLength(2);

    const dayTab = [...host.querySelectorAll<HTMLElement>('[data-slot="tabs-tab"]')].find(
      (tab) => tab.textContent === "日",
    );
    await act(async () => {
      dayTab?.click();
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(host.querySelectorAll('[data-calendar-event-icon="ai"]')).toHaveLength(1);
      expect(host.querySelectorAll('[data-calendar-event-icon="human"]')).toHaveLength(1);
    });

    act(() => root.unmount());
  });
});
