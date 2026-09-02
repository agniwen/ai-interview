// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HumanInterviewMeetingRecord,
  HumanInterviewRoundRecord,
} from "@app/shared/studio-pipeline-stages";
import type { HumanInterviewEvaluation } from "@app/db-schema/studio-interviews";
import { RoundCard } from "./human-interview-stage-rounds";
import type { RoundCardDependencies } from "./human-interview-stage-rounds";
import { ApiError } from "@/lib/client/api";

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const patchRoundMock = vi.fn<RoundCardDependencies["patchHumanInterviewRound"]>();
const updateMeetingMock = vi.fn<RoundCardDependencies["updateHumanInterviewMeeting"]>();
const toastMocks = {
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
};
const originalTimeZone = process.env.TZ;

const dependencies: RoundCardDependencies = {
  isApiError: (error): error is ApiError => error instanceof ApiError,
  notifyError: toastMocks.error,
  notifySuccess: toastMocks.success,
  notifyWarning: toastMocks.warning,
  patchHumanInterviewRound: patchRoundMock,
  renderDateTimePicker: ({ disabled, id, onValueChange, value }) => (
    <input
      aria-label={id}
      disabled={disabled}
      id={id}
      onChange={(event) => onValueChange(event.currentTarget.value)}
      type="datetime-local"
      value={value}
    />
  ),
  updateHumanInterviewMeeting: updateMeetingMock,
};

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
      confirmedScheduleVersion: null,
      declineReason: null,
      declinedAt: null,
      id: "interviewer-1",
      image: null,
      name: "光芒",
      status: "pending",
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
  rounds: [],
  scheduleVersion: 1,
  scheduledAt: "2026-08-05T09:30:00.000Z",
  startedAt: null,
  status: "scheduled",
  title: "张三 - 真人复面",
  updatedAt: "2026-08-05T09:00:00.000Z",
  validUntil: "2026-08-05T10:30:00.000Z",
};
const [baseAssignment] = round.interviewers;
if (!baseAssignment) {
  throw new Error("RoundCard test requires one base interviewer assignment.");
}

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

describe("RoundCard rescheduling", () => {
  it("updates the linked meeting so Feishu can be synchronized", async () => {
    updateMeetingMock.mockResolvedValue(meeting);
    const onRescheduled = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <RoundCard
            canCreate
            canDelete
            canUpdate
            dependencies={dependencies}
            meeting={meeting}
            onCancel={vi.fn()}
            onComplete={vi.fn()}
            onCreateMeeting={vi.fn()}
            onEndMeeting={vi.fn()}
            onOpenLinks={vi.fn()}
            onRescheduled={onRescheduled}
            onReview={vi.fn()}
            round={round}
            roundNumber={2}
            slug="test-workspace"
          />
        </QueryClientProvider>,
      );
    });

    act(() => {
      document.querySelector<HTMLButtonElement>('[aria-label="调整面试时间"]')?.click();
    });
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const scheduledAtInput = document.querySelector(
      "#human-round-round-1-scheduled-at",
    ) as HTMLInputElement;
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const validUntilInput = document.querySelector(
      "#human-round-round-1-valid-until",
    ) as HTMLInputElement;
    const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      setInputValue?.call(scheduledAtInput, "2026-08-05T18:30");
      scheduledAtInput.dispatchEvent(new Event("input", { bubbles: true }));
      setInputValue?.call(validUntilInput, "2026-08-05T19:30");
      validUntilInput.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[aria-label="保存面试时间"]')?.click();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(updateMeetingMock).toHaveBeenCalledWith("test-workspace", "meeting-1", {
        scheduledAt: "2026-08-05T10:30:00.000Z",
        validUntil: "2026-08-05T11:30:00.000Z",
      });
    });
    expect(patchRoundMock).not.toHaveBeenCalled();
    expect(onRescheduled).toHaveBeenCalledOnce();

    act(() => root.unmount());
    queryClient.clear();
  });

  it("refreshes local data and shows a retry warning when Feishu synchronization fails", async () => {
    updateMeetingMock.mockRejectedValue(
      new ApiError("飞书日程更新时间失败", {
        payload: {
          error: "飞书日程更新时间失败",
          feishuStatus: "failed",
          meetingId: "meeting-1",
        },
        status: 502,
      }),
    );
    const onRescheduled = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <RoundCard
            canCreate
            canDelete
            canUpdate
            dependencies={dependencies}
            meeting={meeting}
            onCancel={vi.fn()}
            onComplete={vi.fn()}
            onCreateMeeting={vi.fn()}
            onEndMeeting={vi.fn()}
            onOpenLinks={vi.fn()}
            onRescheduled={onRescheduled}
            onReview={vi.fn()}
            round={round}
            roundNumber={2}
            slug="test-workspace"
          />
        </QueryClientProvider>,
      );
    });
    act(() => {
      document.querySelector<HTMLButtonElement>('[aria-label="调整面试时间"]')?.click();
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[aria-label="保存面试时间"]')?.click();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(toastMocks.warning).toHaveBeenCalledWith(
        "面试时间已调整，但飞书同步失败，可在会议链接中重试",
      );
      expect(onRescheduled).toHaveBeenCalledOnce();
    });
    expect(toastMocks.error).not.toHaveBeenCalled();

    act(() => root.unmount());
    queryClient.clear();
  });
});

describe("RoundCard interviewer arrangement", () => {
  it("shows one complete unified evaluation with submission status", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const evaluation: HumanInterviewEvaluation = {
      detailedAnalysis: "完整详细分析内容",
      evidenceTurnIds: ["turn-1"],
      overallEvaluation: "唯一整体评价内容",
      professionalSkill: "优。具备完整的系统架构与前端工程化能力。",
      rating: "A",
      risks: "规模化经验需要确认",
      rolePosition: "核心方案负责人",
      salaryRecommendation: "",
      seniorityPosition: "高级专家",
      strengths: "架构思路清晰",
    };
    const evaluatedRound = {
      ...round,
      evaluation,
      evaluationOverall: evaluation.overallEvaluation,
      evaluationRating: evaluation.rating,
      evaluationStatus: "submitted" as const,
      feedback: evaluation.overallEvaluation,
      status: "completed" as const,
    };

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <RoundCard
            canCreate
            canDelete
            canUpdate
            dependencies={dependencies}
            meeting={meeting}
            onCancel={vi.fn()}
            onComplete={vi.fn()}
            onCreateMeeting={vi.fn()}
            onEndMeeting={vi.fn()}
            onOpenLinks={vi.fn()}
            onRescheduled={vi.fn()}
            onReview={vi.fn()}
            round={evaluatedRound}
            roundNumber={2}
            slug="test-workspace"
          />
        </QueryClientProvider>,
      );
    });

    expect(host.textContent).toContain("评价 · 已提交");
    expect(host.textContent).not.toContain("AI 评价");
    expect(host.textContent).toContain("评级A");
    expect(host.textContent).toContain("专业技能优");
    expect(host.textContent).not.toContain("具备完整的系统架构与前端工程化能力");
    expect(host.textContent).toContain("职级定位高级专家");
    expect(host.textContent).toContain("角色定位核心方案负责人");
    expect(host.textContent).toContain("优势特点架构思路清晰");
    expect(host.textContent).toContain("劣势风险规模化经验需要确认");
    expect(host.textContent).toContain("薪资建议-");
    expect(host.textContent).toContain("整体评价唯一整体评价内容");
    expect(host.textContent).toContain("完整详细分析完整详细分析内容");
    expect(host.textContent?.match(/唯一整体评价内容/g)).toHaveLength(1);

    act(() => root.unmount());
    queryClient.clear();
  });

  it("offers the unified review flow after the meeting has ended", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onReview = vi.fn();
    const endedMeeting: HumanInterviewMeetingRecord = {
      ...meeting,
      endedAt: "2026-08-05T10:30:00.000Z",
      status: "ended",
    };

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <RoundCard
            canCreate
            canDelete
            canUpdate
            dependencies={dependencies}
            meeting={endedMeeting}
            onCancel={vi.fn()}
            onComplete={vi.fn()}
            onCreateMeeting={vi.fn()}
            onEndMeeting={vi.fn()}
            onOpenLinks={vi.fn()}
            onRescheduled={vi.fn()}
            onReview={onReview}
            round={round}
            roundNumber={2}
            slug="test-workspace"
          />
        </QueryClientProvider>,
      );
    });

    const reviewButton = [...host.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "评价并完成",
    );
    expect(reviewButton).toBeDefined();
    act(() => reviewButton?.click());
    expect(onReview).toHaveBeenCalledWith(endedMeeting);
    expect(host.textContent).not.toContain("标记完成");

    act(() => root.unmount());
    queryClient.clear();
  });

  it("shows interviewer assignments as HR-managed arrangements", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const statusRound: HumanInterviewRoundRecord = {
      ...round,
      interviewers: [
        { ...baseAssignment, name: "待确认人员" },
        {
          ...baseAssignment,
          confirmedAt: "2026-08-05T09:05:00.000Z",
          confirmedScheduleVersion: 1,
          id: "interviewer-2",
          name: "已确认人员",
          status: "confirmed",
        },
        {
          ...baseAssignment,
          confirmedAt: "2026-08-04T09:05:00.000Z",
          confirmedScheduleVersion: 0,
          id: "interviewer-3",
          name: "旧时间人员",
          status: "confirmed",
        },
        {
          ...baseAssignment,
          declinedAt: "2026-08-05T09:06:00.000Z",
          id: "interviewer-4",
          name: "拒绝人员",
          status: "declined",
        },
      ],
    };

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <RoundCard
            canCreate
            canDelete
            canUpdate
            dependencies={dependencies}
            meeting={meeting}
            onCancel={vi.fn()}
            onComplete={vi.fn()}
            onCreateMeeting={vi.fn()}
            onEndMeeting={vi.fn()}
            onOpenLinks={vi.fn()}
            onRescheduled={vi.fn()}
            onReview={vi.fn()}
            round={statusRound}
            roundNumber={2}
            slug="test-workspace"
          />
        </QueryClientProvider>,
      );
    });

    expect(host.textContent).toContain("待确认人员已安排");
    expect(host.textContent).toContain("已确认人员已安排");
    expect(host.textContent).toContain("旧时间人员安排已更新");
    expect(host.textContent).toContain("拒绝人员需联系 HR");

    act(() => root.unmount());
    queryClient.clear();
  });

  it("does not expose confirmation or rescheduling controls without HR update permission", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <RoundCard
            canCreate
            canDelete
            canUpdate={false}
            dependencies={dependencies}
            meeting={meeting}
            onCancel={vi.fn()}
            onComplete={vi.fn()}
            onCreateMeeting={vi.fn()}
            onEndMeeting={vi.fn()}
            onOpenLinks={vi.fn()}
            onRescheduled={vi.fn()}
            onReview={vi.fn()}
            round={round}
            roundNumber={2}
            slug="test-workspace"
          />
        </QueryClientProvider>,
      );
    });
    expect(host.textContent).not.toContain("确认安排");
    expect(host.textContent).not.toContain("无法参加");
    expect(host.querySelector('[aria-label="调整面试时间"]')).toBeNull();

    act(() => root.unmount());
    queryClient.clear();
  });
});
