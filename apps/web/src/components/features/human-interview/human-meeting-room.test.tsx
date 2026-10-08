// @vitest-environment jsdom
/* oxlint-disable anti-slop/no-module-mocking -- Isolate media connections and heavy child panels to exercise the room entry lifecycle. */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HumanMeetingRoom } from "./human-meeting-room";
import type { InterviewerCandidateMaterialsState } from "./interviewer-candidate-materials";

// SAFETY: React's test-only act flag is intentionally attached to the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const media = vi.hoisted(() => ({ connect: vi.fn(), lastProps: vi.fn() }));
vi.mock("@livekit/components-react", () => ({
  LiveKitRoom: ({
    audio,
    children,
    video,
  }: {
    audio: unknown;
    children: ReactNode;
    video: unknown;
  }) => {
    media.connect();
    media.lastProps({ audio, video });
    return <div>{children}</div>;
  },
  RoomAudioRenderer: () => null,
  useRoomContext: () => ({ off: vi.fn(), on: vi.fn(), state: "disconnected" }),
}));
vi.mock("@/components/theme/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("./human-meeting-review", () => ({ HumanMeetingReview: () => null }));
vi.mock("./human-meeting-stage", () => ({
  HumanMeetingStage: ({
    candidateMaterialsState,
    viewMode,
  }: {
    candidateMaterialsState: InterviewerCandidateMaterialsState;
    viewMode: string;
  }) => (
    <div data-view-mode={viewMode}>会议中：{String(candidateMaterialsState.questionsOpen)}</div>
  ),
  humanMeetingControlButtonClass: "",
}));
vi.mock("./interviewer-candidate-materials", () => ({
  InterviewerCandidateMaterials: ({
    headerActionsContainer,
    state,
    onStateChange,
  }: {
    headerActionsContainer?: HTMLElement | null;
    state: InterviewerCandidateMaterialsState;
    onStateChange: (state: InterviewerCandidateMaterialsState) => void;
  }) => (
    <button
      data-has-header-actions={Boolean(headerActionsContainer)}
      onClick={() => onStateChange({ ...state, questionsOpen: false })}
    >
      候选人资料：{String(state.questionsOpen)}
    </button>
  ),
}));

const preview = {
  candidateName: "测试候选人",
  interviewerName: "测试面试官",
  jobDescriptionName: "运营经理",
  jobDescriptionPrompt: "负责用户运营",
  meetingId: "meeting-1",
  recordingStatus: "pending" as const,
  responsibleHrImage: "https://example.com/hr.png",
  responsibleHrName: "上传 HR",
  role: "host" as const,
  roundLabel: "业务一面",
  scheduledAt: "2026-09-24T06:30:00.000Z",
  status: "scheduled" as const,
  title: "运营经理面试",
  validUntil: "2026-09-24T08:30:00.000Z",
};

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-24T05:00:00.000Z"));
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("matchMedia", () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  media.connect.mockClear();
  media.lastProps.mockClear();
  client = new QueryClient();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  client.clear();
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function button(label: string) {
  const result = [...container.querySelectorAll("button")].find(
    (item) => item.textContent?.includes(label) || item.getAttribute("aria-label")?.includes(label),
  );
  if (!result) {
    throw new Error(`Missing button: ${label}`);
  }
  return result;
}

it("opens materials before join time without connecting, and preserves selection through joining", async () => {
  const key = ["human-interview-candidate-materials", "invite-1", "candidates"];
  const loadCandidates = vi.fn().mockResolvedValue({ candidates: ["latest"] });
  await client.fetchQuery({ queryFn: loadCandidates, queryKey: key, staleTime: Infinity });
  loadCandidates.mockClear();
  const otherKey = ["human-interview-candidate-materials", "another-invite", "candidates"];
  client.setQueryData(otherKey, { candidates: [] });
  await act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <HumanMeetingRoom inviteToken="invite-1" mode="interviewer" preview={preview} />
      </QueryClientProvider>,
    ),
  );
  expect(button("未到入会时间").disabled).toBe(true);
  // Both desktop and mobile action areas expose the same independent materials action.
  expect(
    [...container.querySelectorAll("button")].filter(
      (item) => item.textContent === "查看候选人资料",
    ),
  ).toHaveLength(2);
  expect(button("查看候选人资料").disabled).toBe(false);
  expect(button("关闭麦克风").getAttribute("aria-pressed")).toBe("true");
  expect(button("开启摄像头").getAttribute("aria-pressed")).toBe("false");
  await act(() => button("关闭麦克风").click());
  await act(() => button("开启摄像头").click());
  await act(() => button("查看候选人资料").click());
  expect(container.querySelector("header h1")?.textContent).toBe("运营经理面试");
  expect(container.querySelector('header button[aria-label^="会议信息"]')).toBeNull();
  expect(button("返回").closest("header")).not.toBeNull();
  expect(container.querySelector('header [data-slot="meeting-materials-actions"]')).not.toBeNull();
  expect(button("候选人资料：false").dataset.hasHeaderActions).toBe("true");
  expect(button("返回").getAttribute("aria-label")).toBe("返回入会页");
  expect(container.querySelector("footer")).toBeNull();
  await act(() => button("候选人资料：false").click());
  expect(button("候选人资料：false")).toBeDefined();
  expect(media.connect).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  await act(() => button("返回").click());
  expect(button("未到入会时间").disabled).toBe(true);
  await act(() => button("查看候选人资料").click());
  expect(button("候选人资料：false")).toBeDefined();
  await act(() => button("返回").click());
  vi.setSystemTime(new Date("2026-09-24T06:15:00.000Z"));
  await act(() => vi.advanceTimersByTime(60_000));
  expect(button("进入会议").disabled).toBe(false);
  vi.mocked(fetch).mockResolvedValue(
    Response.json({
      participantName: "测试面试官",
      participantRole: "host",
      participantToken: "test-token",
      roomName: "test-room",
      serverUrl: "wss://test.invalid",
    }),
  );
  await act(() => button("进入会议").click());
  expect(fetch).toHaveBeenCalledWith(
    "/api/public/human-interview-meetings/interviewer/invite-1/livekit-token",
    { method: "POST" },
  );
  expect(media.connect).toHaveBeenCalled();
  expect(media.lastProps).toHaveBeenLastCalledWith({
    audio: false,
    video: { resolution: expect.objectContaining({ height: 1080, width: 1920 }) },
  });
  expect(container.textContent).toContain("会议中：false");
  expect(container.querySelector<HTMLElement>("[data-view-mode]")?.dataset.viewMode).toBe(
    "materials",
  );
  expect(loadCandidates).toHaveBeenCalledTimes(1);
  expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);
});

it("does not expose interviewer materials on the candidate entry", async () => {
  await act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <HumanMeetingRoom
          inviteToken="candidate-invite"
          mode="candidate"
          preview={{ ...preview, candidateInviteStatus: "accepted", companyContext: null }}
        />
      </QueryClientProvider>,
    ),
  );
  expect(container.textContent).not.toContain("查看候选人资料");
  expect(button("未到入会时间").disabled).toBe(true);
});

it("applies candidate media choices when joining", async () => {
  vi.setSystemTime(new Date("2026-09-24T06:16:00.000Z"));
  await act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <HumanMeetingRoom
          inviteToken="candidate-invite"
          mode="candidate"
          preview={{ ...preview, candidateInviteStatus: "accepted", companyContext: null }}
        />
      </QueryClientProvider>,
    ),
  );
  await act(() => button("关闭麦克风").click());
  await act(() => button("开启摄像头").click());
  vi.mocked(fetch).mockResolvedValue(
    Response.json({
      participantName: "测试候选人",
      participantRole: "candidate",
      participantToken: "candidate-token",
      roomName: "test-room",
      serverUrl: "wss://test.invalid",
    }),
  );
  await act(() => button("进入会议").click());
  expect(media.lastProps).toHaveBeenLastCalledWith({
    audio: false,
    video: { resolution: expect.objectContaining({ height: 1080, width: 1920 }) },
  });
});
