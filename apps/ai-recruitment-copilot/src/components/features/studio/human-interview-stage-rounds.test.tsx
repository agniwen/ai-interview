// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HumanInterviewMeetingRecord,
  HumanInterviewRoundRecord,
} from "@arc/shared/studio-pipeline-stages";
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
  useWorkspaceSlug: () => "test-workspace",
};

const round: HumanInterviewRoundRecord = {
  cancelReason: null,
  cancelledAt: null,
  completedAt: null,
  createdAt: "2026-08-05T09:00:00.000Z",
  feedback: null,
  format: "online",
  id: "round-1",
  interviewRecordId: "candidate-1",
  interviewers: [{ id: "interviewer-1", image: null, name: "光芒" }],
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
  recordingEgressId: null,
  recordingFileKey: null,
  rounds: [],
  scheduledAt: "2026-08-05T09:30:00.000Z",
  startedAt: null,
  status: "scheduled",
  title: "张三 - 真人复面",
  updatedAt: "2026-08-05T09:00:00.000Z",
  validUntil: "2026-08-05T10:30:00.000Z",
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
            round={round}
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
            round={round}
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
