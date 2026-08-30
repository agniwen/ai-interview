// @vitest-environment jsdom

import type {
  StudioAiCalendarEvent,
  StudioAiCalendarEventPreview,
} from "@arc/shared/studio-calendar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiInterviewEventHoverCard } from "./ai-interview-event-hover-card";

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchPreviewMock = vi.hoisted(() => vi.fn());
const originalTimeZone = process.env.TZ;
const getRevealState = () =>
  document.body.querySelector<HTMLElement>('[data-slot="skeleton-reveal"]')?.dataset.state;

const event: StudioAiCalendarEvent = {
  candidates: [
    {
      candidateName: "张三",
      interviewRecordId: "candidate-1",
      roundId: "round-1",
      roundLabel: "技术初筛",
    },
  ],
  conversationId: "conversation-1",
  endAt: "2026-07-26T02:42:00.000Z",
  id: "ai-result:conversation-1",
  kind: "ai",
  source: "result",
  startAt: "2026-07-26T02:00:00.000Z",
  status: "ended",
  title: "技术初筛",
};

const preview: StudioAiCalendarEventPreview = {
  candidate: {
    id: "candidate-1",
    jobDescriptionName: "前端工程师",
    name: "张三",
    targetRole: "高级前端工程师",
  },
  result: {
    conversationId: "conversation-1",
    durationSecs: 2520,
    endedAt: "2026-07-26T02:42:00.000Z",
    reportStatus: "ready",
    startedAt: "2026-07-26T02:00:00.000Z",
    summary: "候选人熟悉 React 和 TypeScript。",
    turnCount: 28,
  },
  round: {
    allowTextInput: true,
    disconnectedAt: null,
    id: "round-1",
    label: "技术初筛",
    scheduledAt: "2026-07-26T02:00:00.000Z",
    scheduledEndAt: "2026-07-26T03:00:00.000Z",
    sessionStartedAt: "2026-07-26T02:00:00.000Z",
    status: "completed",
  },
};

beforeEach(() => {
  process.env.TZ = "Asia/Shanghai";
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
});

describe("AiInterviewEventHoverCard", () => {
  it("requests and renders the lightweight preview only after the card opens", async () => {
    const previewResult = Promise.withResolvers<StudioAiCalendarEventPreview>();
    fetchPreviewMock.mockReturnValue(previewResult.promise);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <AiInterviewEventHoverCard
            event={event}
            dependencies={{ fetchPreview: fetchPreviewMock, renderNavigation: () => <span /> }}
            slug="demo"
            trigger={<button type="button">张三 · 技术初筛</button>}
          />
        </QueryClientProvider>,
      );
    });

    expect(fetchPreviewMock).not.toHaveBeenCalled();

    await act(async () => {
      host.querySelector("button")?.focus();
      await vi.waitFor(() => expect(fetchPreviewMock).toHaveBeenCalled());
    });

    expect(getRevealState()).toBe("loading");
    expect(document.body.querySelector('[aria-label="正在加载 AI 面试详情"]')).not.toBeNull();

    await act(async () => {
      previewResult.resolve(preview);
      await previewResult.promise;
    });

    await vi.waitFor(() => {
      expect(fetchPreviewMock).toHaveBeenCalledWith("demo", "round-1", "conversation-1");
      expect(document.body.textContent).toContain("前端工程师");
      expect(document.body.textContent).toContain("42 分钟");
      expect(document.body.textContent).toContain("28 轮对话");
      expect(document.body.textContent).toContain("AI 面试记录 · 技术初筛");
      expect(document.body.textContent).toContain("报告状态已生成");
      expect(document.body.textContent).toContain("候选人熟悉 React 和 TypeScript。");
      expect(getRevealState()).toBe("revealed");
    });

    act(() => root.unmount());
  });

  it("keeps the event identity visible when preview loading fails", async () => {
    fetchPreviewMock.mockRejectedValue(new Error("network unavailable"));
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <AiInterviewEventHoverCard
            event={event}
            dependencies={{ fetchPreview: fetchPreviewMock, renderNavigation: () => <span /> }}
            slug="demo"
            trigger={<button type="button">张三 · 技术初筛</button>}
          />
        </QueryClientProvider>,
      );
    });

    await act(async () => {
      host.querySelector("button")?.focus();
      await vi.waitFor(() => expect(fetchPreviewMock).toHaveBeenCalled());
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("张三");
      expect(document.body.textContent).toContain("AI 面试记录 · 技术初筛");
      expect(document.body.textContent).toContain("AI 面试详情加载失败，请稍后重试。");
    });

    act(() => root.unmount());
  });

  it("distinguishes an interrupted connection from a generic in-progress round", async () => {
    fetchPreviewMock.mockResolvedValue({
      ...preview,
      result: {
        ...preview.result,
        durationSecs: null,
        endedAt: null,
        reportStatus: "pending",
        summary: null,
      },
      round: {
        ...preview.round,
        disconnectedAt: "2026-07-26T02:18:00.000Z",
        status: "interrupted",
      },
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <AiInterviewEventHoverCard
            event={{ ...event, status: "in_progress" }}
            dependencies={{ fetchPreview: fetchPreviewMock, renderNavigation: () => <span /> }}
            slug="demo"
            trigger={<button type="button">张三 · 技术初筛</button>}
          />
        </QueryClientProvider>,
      );
    });

    await act(async () => {
      host.querySelector("button")?.focus();
      await vi.waitFor(() => expect(fetchPreviewMock).toHaveBeenCalled());
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("连接中断");
      expect(document.body.textContent).toContain("已中断 · 7月26日 10:18");
    });

    act(() => root.unmount());
  });
});
