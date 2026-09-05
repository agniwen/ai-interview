// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import type { HumanInterviewMeetingDetail } from "@app/shared/human-interview-meeting-detail";
import {
  HumanInterviewMeetingDetailContent,
  HumanInterviewMeetingDetailPage,
} from "./human-interview-meeting-detail-page";

import { StudioHeaderProvider, useStudioHeaderOverrideValue } from "./studio-header-context";

function TestContentHeader() {
  return <header data-testid="content-header">{useStudioHeaderOverrideValue()}</header>;
}

function TestStudioLayout() {
  return (
    <StudioHeaderProvider>
      <TestContentHeader />
      <Outlet />
    </StudioHeaderProvider>
  );
}

// SAFETY: React's test-only act flag enables deterministic rendering assertions.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const detail: HumanInterviewMeetingDetail = {
  candidateId: "candidate",
  candidateName: "张三",
  endedAt: "2026-09-03T01:00:00Z",
  evaluation: {
    detailedAnalysis: "本轮完整详细分析",
    evidenceTurnIds: [],
    overallEvaluation: "本轮整体评价",
    professionalSkill: "良",
    rating: "B",
    risks: "待验证",
    rolePosition: "工程师",
    salaryRecommendation: "",
    seniorityPosition: "高级",
    strengths: "结构清晰",
  },
  evaluationError: null,
  evaluationStatus: "submitted",
  evaluationSubmittedAt: null,
  feedback: null,
  interviewers: [{ id: "interviewer", name: "李老师" }],
  meetingId: "meeting",
  outcome: "pass",
  recordingNotice: null,
  roundId: "round",
  roundLabel: "业务二面",
  roundStatus: "completed",
  scheduledAt: null,
  startedAt: "2026-09-03T00:00:00Z",
  title: "面试",
  transcript: {
    basedOnRevisionId: null,
    createdAt: "2026-09-03T01:00:00Z",
    createdBy: null,
    id: "source",
    kind: "human",
    language: "zh-CN",
    model: "test",
    provider: "manual",
    region: "test",
    revision: 1,
    turns: [
      {
        attribution: null,
        confidence: null,
        endMs: 3000,
        id: "turn-1",
        sequence: 0,
        speakerDisplayName: "李老师",
        speakerKey: "local",
        startMs: 1000,
        text: "请介绍最近的项目。",
        track: "local",
      },
      {
        attribution: null,
        confidence: null,
        endMs: 7000,
        id: "turn-2",
        sequence: 1,
        speakerDisplayName: null,
        speakerKey: "remote",
        startMs: 4000,
        text: "身份尚不确定的完整回答。",
        track: "remote",
      },
    ],
  },
  transcriptBasis: "evaluation",
  transcriptNotice: null,
  transcriptionError: null,
  transcriptionState: "ready",
};
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function renderDetail(value: HumanInterviewMeetingDetail) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<HumanInterviewMeetingDetailContent detail={value} />));
  return { host, unmount: () => act(() => root.unmount()) };
}

describe("read-only human meeting detail", () => {
  it("shows every turn with time and unknown attribution, without editing controls", () => {
    const view = renderDetail(detail);
    expect(view.host.textContent).toContain("面试详情 · 张三");
    expect(view.host.querySelector('[role="tablist"] svg')).toBeNull();
    expect(view.host.textContent).toContain("共 2 段发言");
    expect(view.host.textContent).toContain("请介绍最近的项目。");
    expect(view.host.textContent).toContain("身份尚不确定的完整回答。");
    expect(view.host.textContent).toContain("身份未确认");
    expect(view.host.textContent).toContain("00:01 – 00:03");
    expect(view.host.querySelector("textarea, input, audio, video")).toBeNull();
    view.unmount();
  });
  it("aligns confirmed candidate bubbles right while preserving unknown speakers", () => {
    if (!detail.transcript) {
      throw new Error("Missing transcript fixture");
    }
    const view = renderDetail({
      ...detail,
      transcript: {
        ...detail.transcript,
        turns: detail.transcript.turns.map((turn, index) => ({
          ...turn,
          attribution:
            index === 0
              ? {
                  method: "manual",
                  participantIdentity: null,
                  role: "candidate",
                  sourceId: "confirmed-candidate",
                }
              : null,
        })),
      },
    });
    expect(view.host.querySelector(".is-user")?.textContent).toContain("请介绍最近的项目。");
    expect(view.host.querySelector(".is-assistant")?.textContent).toContain("身份未确认");
    expect(view.host.querySelector(".is-assistant")?.textContent).toContain(
      "身份尚不确定的完整回答。",
    );
    view.unmount();
  });
  it("switches to the complete submitted evaluation", () => {
    const view = renderDetail(detail);
    const tab = [...view.host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === "面试评价",
    );
    expect(tab).toBeDefined();
    act(() => tab?.click());
    expect(view.host.textContent).toContain("已提交");
    expect(view.host.textContent).toContain("本轮完整详细分析");
    expect(view.host.querySelector("textarea, input")).toBeNull();
    view.unmount();
  });
  it.each(["generating", "failed"] as const)(
    "identifies the retained evaluation as an old draft when regeneration is %s",
    (evaluationStatus) => {
      const view = renderDetail({
        ...detail,
        evaluationStatus,
        transcriptBasis: "unlinked",
        transcriptNotice: "当前评价为重新生成前的旧稿，无法确认与当前转录对应。",
      });
      expect(view.host.textContent).not.toContain("评价对应转录");
      const tab = [...view.host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
        (item) => item.textContent === "面试评价",
      );
      act(() => tab?.click());
      expect(view.host.textContent).toContain("本轮完整详细分析");
      expect(view.host.textContent).toContain("旧稿");
      expect(view.host.textContent).toContain("无法确认与当前转录对应");
      expect(view.host.textContent).toContain(
        evaluationStatus === "generating" ? "重新生成中" : "生成失败",
      );
      expect(view.host.textContent).not.toContain("待提交");
      view.unmount();
    },
  );
  it("keeps missing recording and version notices visible", () => {
    const view = renderDetail({
      ...detail,
      recordingNotice: "部分录音缺失",
      transcript: null,
      transcriptNotice: "评价所依据的转录暂不可用",
      transcriptionState: "failed",
    });
    expect(view.host.textContent).toContain("部分录音缺失");
    expect(view.host.textContent).toContain("评价所依据的转录暂不可用");
    expect(view.host.textContent).toContain("已有评价仍可查看");
    view.unmount();
  });
  it("opens while processing and displays the eventual transcript", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <HumanInterviewMeetingDetailContent
          detail={{
            ...detail,
            evaluation: null,
            evaluationStatus: "generating",
            transcript: null,
            transcriptionState: "processing",
          }}
        />,
      ),
    );
    expect(host.textContent).toContain("正在整理转录");
    act(() => root.render(<HumanInterviewMeetingDetailContent detail={detail} />));
    expect(host.textContent).toContain("请介绍最近的项目。");
    act(() => root.unmount());
  });
  it.each(["unavailable", "pending"] as const)(
    "polls only when transcript state %s can still progress",
    async (transcriptionState) => {
      vi.useFakeTimers();
      const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
      const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
        Promise.resolve(
          Response.json({
            ...detail,
            transcript: null,
            transcriptionState,
          }),
        ),
      );
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      const rootRoute = createRootRoute({ component: TestStudioLayout });
      const pageRoute = createRoute({
        component: () => (
          <HumanInterviewMeetingDetailPage
            slug="acme"
            candidateId="candidate"
            roundId="round"
            meetingId="meeting"
          />
        ),
        getParentRoute: () => rootRoute,
        path: "/meeting",
      });
      const router = createRouter({
        history: createMemoryHistory({ initialEntries: ["/meeting"] }),
        routeTree: rootRoute.addChildren([pageRoute]),
      });
      try {
        await act(async () => {
          await router.load();
          root.render(
            <QueryClientProvider client={client}>
              <RouterProvider router={router} />
            </QueryClientProvider>,
          );
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(50);
        });
        expect(host.textContent).toContain(
          transcriptionState === "unavailable" ? "暂无可用转录" : "转录尚未就绪",
        );
        if (transcriptionState === "unavailable") {
          expect(host.textContent).not.toContain("会自动更新");
        }
        expect(host.querySelector('[data-testid="content-header"]')?.textContent).toContain(
          "返回真人面试",
        );
        expect(host.querySelector("main")?.textContent).not.toContain("返回真人面试");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(15_000);
        });
        expect(fetchMock).toHaveBeenCalledTimes(transcriptionState === "unavailable" ? 1 : 4);
      } finally {
        act(() => root.unmount());
        client.clear();
        fetchMock.mockRestore();
        scrollTo.mockRestore();
        vi.useRealTimers();
      }
    },
  );
});
