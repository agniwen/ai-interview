// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  HumanInterviewMeetingRecord,
  HumanInterviewRoundRecord,
} from "@app/shared/studio-pipeline-stages";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { humanInterviewKeys } from "@/lib/client/api/query-keys";
import {
  enableReactActEnvironment,
  installNoopResizeObserver,
  installNoopWebAnimations,
  renderInAct,
  unmountInAct,
  waitForUi,
} from "@/test-utils/react-act";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { ScheduleHumanInterviewButton } from "./schedule-human-interview-button";
import { HumanInterviewStagePanel } from "./human-interview-stage-panel";

enableReactActEnvironment();
installNoopResizeObserver();
installNoopWebAnimations();
const slug = "test-workspace";
const candidateId = "candidate-1";
const round: HumanInterviewRoundRecord = {
  cancelReason: null,
  cancelledAt: null,
  completedAt: null,
  createdAt: "2026-08-05T09:00:00.000Z",
  evaluation: null,
  evaluationError: null,
  evaluationOverall: null,
  evaluationRating: null,
  evaluationStatus: "not_started",
  evaluationSubmittedAt: null,
  evaluationTranscriptRevisionId: null,
  evaluationUpdatedAt: null,
  evaluationUpdatedBy: null,
  feedback: null,
  format: "online",
  id: "round-1",
  interviewRecordId: "candidate-1",
  interviewers: [
    {
      confirmedAt: null,
      confirmedScheduleVersion: 1,
      declineReason: null,
      declinedAt: null,
      id: "interviewer-1",
      image: null,
      name: "光芒",
      status: "confirmed",
    },
  ],
  label: "真人复面",
  location: null,
  meetingUrl: "https://vc.feishu.cn/j/123456789",
  notes: null,
  organizationId: "org-1",
  outcome: null,
  scheduledAt: "2026-08-05T09:30:00.000Z",
  score: null,
  sortOrder: 0,
  status: "pending",
  updatedAt: "2026-08-05T09:00:00.000Z",
};

const meeting: HumanInterviewMeetingRecord = {
  cancelledAt: null,
  createdAt: "2026-08-05T09:00:00.000Z",
  createdBy: "operator-1",
  endedAt: null,
  feishu: {
    appLink: "https://applink.feishu.cn/client/video/123456789",
    calendarEventUrl: "https://applink.feishu.cn/client/calendar/event/event-1",
    meetingUrl: "https://vc.feishu.cn/j/123456789",
    providerId: "feishu-jiguang-hr",
    status: "ready",
  },
  id: "meeting-1",
  interviewers: [],
  lifecycleOccurredAt: null,
  lifecycleSource: null,
  liveKitRoomName: "human-meeting-1",
  notes: null,
  organizationId: "org-1",
  processingMeetingSessionId: null,
  recordingDurationMs: null,
  recordingEgressId: null,
  recordingError: null,
  recordingFileKey: null,
  recordingSizeBytes: null,
  recordingStatus: "pending",
  rounds: [
    {
      candidateInviteExpiresAt: null,
      candidateInviteStatus: "pending",
      candidateName: "测试候选人",
      hasCandidateInvite: false,
      interviewRecordId: "candidate-1",
      joinedAt: null,
      label: "真人复面",
      leftAt: null,
      roundId: "round-1",
      sortOrder: 0,
      status: "pending",
    },
  ],
  scheduleVersion: 1,
  scheduledAt: "2026-08-05T09:30:00.000Z",
  startedAt: null,
  status: "scheduled",
  title: "张三 - 真人复面",
  updatedAt: "2026-08-05T09:00:00.000Z",
  validUntil: "2026-08-05T10:30:00.000Z",
};

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function mountPanel(grouped = false) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      addEventListener() {},
      dispatchEvent() {
        return true;
      },
      matches: false,
      media: query,
      onchange: null,
      removeEventListener() {},
    }),
  });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["workspace-members", slug], []);
  const rounds = Promise.withResolvers<HumanInterviewRoundRecord[]>();
  const meetings = Promise.withResolvers<HumanInterviewMeetingRecord[]>();
  // Seed in-flight requests through QueryClient so the actual panel subscribes to
  // independently controlled responses without mocking its hooks or API modules.
  const roundsRequest = client
    .fetchQuery({
      queryFn: () => rounds.promise,
      queryKey: humanInterviewKeys.rounds(slug, candidateId),
    })
    .catch(() => {});
  const meetingsRequest = client
    .fetchQuery({
      queryFn: () => meetings.promise,
      queryKey: humanInterviewKeys.meetings(slug, candidateId),
    })
    .catch(() => {});
  const rootRoute = createRootRoute({
    component: () =>
      grouped ? (
        <ButtonGroup aria-label="阶段操作">
          <ScheduleHumanInterviewButton candidateId={candidateId} candidateName="测试候选人" />
          <Button size="sm">推进到 Offer</Button>
        </ButtonGroup>
      ) : (
        <HumanInterviewStagePanel candidateId={candidateId} candidateName="测试候选人" />
      ),
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute,
  });
  await router.load();
  const { container, root } = await renderInAct(
    <QueryClientProvider client={client}>
      <WorkspaceSlugProvider id="org-1" slug={slug} memberRole="admin" permissions={{}}>
        <RouterProvider router={router} />
      </WorkspaceSlugProvider>
    </QueryClientProvider>,
  );
  return {
    client,
    async close() {
      await unmountInAct(root);
      client.clear();
    },
    container,
    meetings,
    meetingsRequest,
    rounds,
    roundsRequest,
  };
}

describe("human interview initial loading", () => {
  it.each(["rounds", "meetings"] as const)(
    "waits for both responses when %s arrive first",
    async (first) => {
      const view = await mountPanel();
      try {
        expect(view.container.querySelector('[aria-label="加载真人复面"]')).not.toBeNull();
        await act(async () => {
          if (first === "rounds") {
            view.rounds.resolve([round]);
            await view.roundsRequest;
          } else {
            view.meetings.resolve([meeting]);
            await view.meetingsRequest;
          }
        });
        await waitForUi(() => {
          expect(view.container.textContent).not.toContain("安排已更新");
          expect(view.container.textContent).not.toContain("创建会议");
          expect(view.container.querySelector('[aria-label="加载真人复面"]')).not.toBeNull();
        });
        await act(async () => {
          view.rounds.resolve([round]);
          view.meetings.resolve([meeting]);
          await Promise.all([view.roundsRequest, view.meetingsRequest]);
        });
        await waitForUi(() => {
          expect(view.container.querySelector('[aria-label="加载真人复面"]')).toBeNull();
          expect(view.container.textContent).toContain("待开始（视频）");
          expect(view.container.textContent).not.toContain("安排已更新");
        });
      } finally {
        await view.close();
      }
    },
  );
});

it("shows a failed initial request without rendering a false meeting state", async () => {
  const view = await mountPanel();
  try {
    await act(async () => {
      view.rounds.resolve([round]);
      view.meetings.reject(new Error("会议加载失败"));
      await Promise.all([view.roundsRequest, view.meetingsRequest]);
    });
    await waitForUi(() => {
      expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("会议加载失败");
      expect(view.container.textContent).not.toContain("安排已更新");
      expect(view.container.textContent).not.toContain("创建会议");
    });
  } finally {
    await view.close();
  }
});

it("retains loaded cards during a background request and its failure", async () => {
  const view = await mountPanel();
  try {
    await act(async () => {
      view.rounds.resolve([round]);
      view.meetings.resolve([meeting]);
      await Promise.all([view.roundsRequest, view.meetingsRequest]);
    });
    await waitForUi(() => expect(view.container.textContent).toContain("待开始（视频）"));
    const background = Promise.withResolvers<HumanInterviewMeetingRecord[]>();
    let request: Promise<unknown>;
    await act(() => {
      request = view.client
        .fetchQuery({
          queryFn: () => background.promise,
          queryKey: humanInterviewKeys.meetings(slug, candidateId),
          staleTime: 0,
        })
        .catch(() => {});
    });
    expect(view.container.querySelector('[aria-label="加载真人复面"]')).toBeNull();
    expect(view.container.textContent).toContain("待开始（视频）");
    await act(async () => {
      background.reject(new Error("刷新失败"));
      await request;
    });
    await waitForUi(() => {
      expect(
        view.client.getQueryState(humanInterviewKeys.meetings(slug, candidateId))?.status,
      ).toBe("error");
      expect(view.container.textContent).toContain("待开始（视频）");
      expect(view.container.querySelector('[role="alert"]')).toBeNull();
      expect(view.container.textContent).not.toContain("安排已更新");
    });
  } finally {
    await view.close();
  }
});

it("keeps scheduling as a direct grouped button across loading, blocked and allowed states", async () => {
  const view = await mountPanel(true);
  const button = () =>
    view.container.querySelector<HTMLButtonElement>('[aria-label="阶段操作"] > button');
  try {
    expect(button()?.textContent).toContain("安排真人复面");
    expect(button()?.getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      view.rounds.resolve([round]);
      view.meetings.resolve([meeting]);
      await Promise.all([view.roundsRequest, view.meetingsRequest]);
    });
    expect(button()?.getAttribute("aria-disabled")).toBe("true");
    act(() => button()?.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    act(() => {
      button()?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      button()?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    });
    await waitForUi(() =>
      expect(document.querySelector('[data-slot="tooltip-content"]')?.textContent).toContain(
        "请先结束并标记完成",
      ),
    );
    for (const outcome of ["pass", "fail", null] as const) {
      act(() => {
        view.client.setQueryData(humanInterviewKeys.rounds(slug, candidateId), [
          { ...round, outcome, status: "completed" },
        ]);
      });
      await waitForUi(() =>
        expect(button()?.getAttribute("aria-disabled")).toBe(String(outcome !== "pass")),
      );
      expect(view.container.querySelectorAll('[aria-label="阶段操作"] > button')).toHaveLength(2);
    }
    act(() => {
      view.client.setQueryData(humanInterviewKeys.rounds(slug, candidateId), []);
    });
    await waitForUi(() => expect(button()?.getAttribute("aria-disabled")).toBe("false"));
    act(() => button()?.click());
    await waitForUi(() =>
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain("安排真人复面"),
    );
    expect(view.container.querySelectorAll('[aria-label="阶段操作"] > button')).toHaveLength(2);
  } finally {
    await view.close();
  }
});
