// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarEventTooltip, StudioCalendarPage } from "./studio-calendar-page";

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    addEventListener: vi.fn(),
    matches: false,
    media,
    removeEventListener: vi.fn(),
  })),
});

const fetchStudioCalendarMock = vi.hoisted(() =>
  vi.fn((_slug: string, _rangeStart: string, _rangeEnd: string) => {
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
              canOpenRecruitingRecord: true,
              candidateName: "张三",
              interviewRecordId: "interview-1",
              jobDescriptionName: "前端工程师",
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
          title: "张三-前端工程师-AI 初面",
        },
        {
          candidates: [
            {
              canOpenRecruitingRecord: true,
              candidateName: "李四",
              interviewRecordId: "interview-2",
              jobDescriptionName: "前端技术经理",
              roundId: "round-2",
              roundLabel: "技术复面",
            },
            {
              canOpenRecruitingRecord: true,
              candidateName: "李小四",
              interviewRecordId: "interview-2b",
              jobDescriptionName: "前端技术经理",
              roundId: "round-2b",
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
          title: "李四-前端技术经理-技术复面",
          viewerInterviewerInviteToken: null,
        },
        {
          candidates: [
            {
              canOpenRecruitingRecord: true,
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
          title: "王五-未关联岗位-AI 复面",
        },
        {
          candidates: [
            {
              canOpenRecruitingRecord: true,
              candidateName: "赵六",
              interviewRecordId: "interview-4",
              roundId: "round-4",
              roundLabel: "终面",
            },
          ],
          endAt: endAt.toISOString(),
          format: "onsite" as const,
          id: "human:round-4",
          interviewers: [{ id: "user-2", name: "陈面试官" }],
          kind: "human" as const,
          location: "会议室 A",
          meetingUrl: null,
          startAt: startAt.toISOString(),
          status: "ended" as const,
          title: "赵六-未关联岗位-终面",
          viewerInterviewerInviteToken: null,
        },
      ],
    });
  }),
);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-02T09:00:00+08:00"));
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("StudioCalendarPage", () => {
  it("shows the interview job in the human event content", async () => {
    const { events } = await fetchStudioCalendarMock("demo", "2026-09-02", "2026-10-02");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<CalendarEventTooltip event={events[1]} />));
    expect(host.textContent).toContain("李四-前端技术经理-技术复面");
    expect(host.textContent).toContain("面试岗位：前端技术经理");
    expect(host.textContent).toContain("候选人：李四");
    act(() => root.unmount());
  });
  it("renders the ReUI calendar without a React hook dispatcher error", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const openAgendaEvent = vi.fn();
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <StudioCalendarPage
            fetchCalendar={fetchStudioCalendarMock}
            onOpenAgendaEvent={openAgendaEvent}
            slug="demo"
          />
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
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(host.textContent).toContain("张三");
    expect(host.textContent).toContain("前端工程师");
    expect(host.textContent).toContain("AI 初面");
    expect(host.textContent).toContain("李四");
    expect(host.textContent).toContain("前端技术经理");
    expect(host.textContent).toContain("技术复面");
    expect(host.textContent).not.toContain("赵六");
    expect(host.querySelector('[data-slot="event-calendar-agenda-view"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-slot="tabs-tab"]')).toHaveLength(2);
    expect(host.querySelector('[data-slot="calendar-primary-view-row"]')).not.toBeNull();
    expect(host.querySelector('[data-slot="calendar-range-view-row"]')).toBeNull();
    expect(host.textContent).toContain("今天 · 9月2日（周三）");
    expect(host.textContent).toContain("真人面试");
    expect(host.textContent).toContain("王面试官");
    expect(host.textContent).toContain("线上");
    expect(host.querySelector('[data-slot="event-calendar-event-dot"]')).toBeNull();

    const aiAgendaRow = [
      ...host.querySelectorAll<HTMLElement>(
        '[data-slot="event-calendar-event"][data-view="agenda"]',
      ),
    ].find((event) => event.textContent?.includes("张三"));
    expect(aiAgendaRow).toBeDefined();
    act(() => aiAgendaRow?.click());
    expect(openAgendaEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        candidates: [expect.objectContaining({ interviewRecordId: "interview-1" })],
        kind: "ai",
      }),
      expect.objectContaining({ interviewRecordId: "interview-1" }),
    );

    const humanAgendaRow = [
      ...host.querySelectorAll<HTMLElement>(
        '[data-slot="event-calendar-event"][data-view="agenda"]',
      ),
    ].find((event) => event.textContent?.includes("李四"));
    expect(humanAgendaRow).toBeDefined();
    act(() => humanAgendaRow?.click());
    expect(document.body.textContent).toContain("选择要查看的候选人");
    expect(openAgendaEvent).toHaveBeenCalledTimes(1);
    const secondCandidate = [
      ...document.body.querySelectorAll<HTMLElement>('[data-slot="dialog-content"] button'),
    ].find((button) => button.textContent?.includes("李小四"));
    expect(secondCandidate).toBeDefined();
    act(() => secondCandidate?.click());
    expect(openAgendaEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "human" }),
      expect.objectContaining({ interviewRecordId: "interview-2b" }),
    );

    const pendingCalendar = Promise.withResolvers<{ events: never[] }>();
    fetchStudioCalendarMock.mockImplementationOnce(() => pendingCalendar.promise);
    const calendarTab = [...host.querySelectorAll<HTMLElement>('[data-slot="tabs-tab"]')].find(
      (tab) => tab.textContent === "日历",
    );
    expect(calendarTab).toBeDefined();
    await act(async () => {
      calendarTab?.focus();
      calendarTab?.click();
      await vi.waitFor(() => {
        expect(
          host.querySelector('[data-slot="event-calendar-content"][data-view="week"]'),
        ).not.toBeNull();
      });
    });

    expect(host.querySelector('[aria-label="正在加载面试日程"]')).toBeNull();
    expect(host.querySelector('[data-slot="event-calendar"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-slot="tabs-tab"]')).toHaveLength(5);
    const viewControls = host.querySelector<HTMLElement>('[data-slot="calendar-view-controls"]');
    expect(viewControls?.className).toContain("flex-col");
    expect(viewControls?.children).toHaveLength(2);
    expect(host.querySelector('[data-slot="calendar-primary-view-row"]')).not.toBeNull();
    expect(host.querySelector('[data-slot="calendar-range-view-row"]')).not.toBeNull();
    expect(host.querySelector('[data-calendar-event-icon="ai"]')).not.toBeNull();
    expect(host.querySelector('[data-calendar-event-icon="human"]')).not.toBeNull();
    const aiEvent = [
      ...host.querySelectorAll<HTMLElement>('[data-slot="event-calendar-event"]'),
    ].find((event) => event.textContent?.includes("张三-前端工程师-AI 初面"));
    const humanEvent = [
      ...host.querySelectorAll<HTMLElement>('[data-slot="event-calendar-event"]'),
    ].find((event) => event.textContent?.includes("李四-前端技术经理-技术复面"));
    const pendingAiEvent = [
      ...host.querySelectorAll<HTMLElement>('[data-slot="event-calendar-event"]'),
    ].find((event) => event.textContent?.includes("王五-未关联岗位-AI 复面"));
    const endedHumanEvent = [
      ...host.querySelectorAll<HTMLElement>('[data-slot="event-calendar-event"]'),
    ].find((event) => event.textContent?.includes("赵六-未关联岗位-终面"));
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
    act(() => humanEvent?.click());
    expect(openAgendaEvent).toHaveBeenCalledTimes(2);
    const todayHeader = host.querySelector<HTMLElement>(
      '[data-slot="event-calendar-day-header"][data-today] > span',
    );
    expect(todayHeader?.className).toContain("bg-primary/10");
    expect(todayHeader?.className).toContain("rounded-md");
    const weekHeaders = [
      ...host.querySelectorAll<HTMLElement>('[data-slot="event-calendar-day-header"] > span'),
    ];
    expect(
      weekHeaders.some(
        (header) => header.textContent === "周一8.31" && header.children.length === 2,
      ),
    ).toBe(true);
    expect(
      weekHeaders.some(
        (header) => header.textContent === "周二9.1" && header.children.length === 2,
      ),
    ).toBe(true);
    expect(
      weekHeaders.some((header) => header.textContent === "周三2" && header.children.length === 2),
    ).toBe(true);

    const monthTab = [...host.querySelectorAll<HTMLElement>('[data-slot="tabs-tab"]')].find(
      (tab) => tab.textContent === "月",
    );
    await act(async () => {
      monthTab?.focus();
      monthTab?.click();
      await Promise.resolve();
    });
    expect(host.querySelector('[data-slot="event-calendar-month-view"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-calendar-event-icon="ai"]')).toHaveLength(2);
    expect(host.querySelectorAll('[data-calendar-event-icon="human"]')).toHaveLength(2);
    const monthTodayDayNumbers = host.querySelectorAll<HTMLElement>(
      '[data-slot="event-calendar-month-cell"][data-today] span',
    );
    expect(
      [...monthTodayDayNumbers].some((dayNumber) => dayNumber.classList.contains("bg-primary")),
    ).toBe(true);

    const dayTab = [...host.querySelectorAll<HTMLElement>('[data-slot="tabs-tab"]')].find(
      (tab) => tab.textContent === "日",
    );
    await act(async () => {
      dayTab?.focus();
      dayTab?.click();
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(host.querySelectorAll('[data-calendar-event-icon="ai"]')).toHaveLength(1);
      expect(host.querySelectorAll('[data-calendar-event-icon="human"]')).toHaveLength(1);
    });

    const listTab = [...host.querySelectorAll<HTMLElement>('[data-slot="tabs-tab"]')].find(
      (tab) => tab.textContent === "列表",
    );
    await act(async () => {
      listTab?.focus();
      listTab?.click();
      await Promise.resolve();
    });
    expect(host.querySelector('[data-slot="event-calendar-agenda-view"]')).not.toBeNull();

    const [firstCall] = fetchStudioCalendarMock.mock.calls;
    expect(firstCall).toBeDefined();
    if (!firstCall) {
      throw new Error("日程查询未执行");
    }
    const [, firstStart, firstEnd] = firstCall;
    expect(new Date(firstEnd).getTime() - new Date(firstStart).getTime()).toBe(
      30 * 24 * 60 * 60 * 1000,
    );

    act(() => root.unmount());
  });
});
