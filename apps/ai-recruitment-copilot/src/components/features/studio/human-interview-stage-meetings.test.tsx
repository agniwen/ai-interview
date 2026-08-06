// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  HumanInterviewMeetingLinkBundle,
  HumanInterviewMeetingRecord,
} from "@arc/shared/studio-pipeline-stages";
import { MeetingLinksDialog } from "./human-interview-stage-meetings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
  })),
});

const issueLinksMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/client/api", () => ({
  issueHumanInterviewMeetingLinks: issueLinksMock,
}));

vi.mock("@/lib/client/workspace-context", () => ({
  useWorkspaceSlug: () => "test-workspace",
}));

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

const meeting: HumanInterviewMeetingRecord = {
  cancelledAt: null,
  createdAt: "2026-08-05T09:00:00.000Z",
  createdBy: "operator-1",
  endedAt: null,
  feishu: {
    appLink: "https://applink.feishu.cn/client/video/123456789",
    calendarEventUrl: "https://applink.feishu.cn/client/calendar/event/event-1",
    meetingUrl: "https://vc.feishu.cn/j/123456789",
    providerId: "feishu",
    status: "ready",
  },
  id: "meeting-1",
  interviewers: [],
  liveKitRoomName: "human-interview-meeting-1",
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
  validUntil: "2026-08-06T09:30:00.000Z",
};

const links: HumanInterviewMeetingLinkBundle = {
  candidateLinks: [
    {
      candidateName: "张三",
      expiresAt: "2026-08-06T09:30:00.000Z",
      interviewRecordId: "candidate-1",
      roundId: "round-1",
      roundLabel: "真人复面",
      url: "/human-interview/candidate-token",
    },
  ],
  feishu: meeting.feishu,
  interviewerLinks: [
    {
      name: "光芒",
      role: "host",
      url: "/human-interview/interviewer/interviewer-token",
      userId: "interviewer-1",
    },
  ],
  meetingId: meeting.id,
  title: meeting.title,
};

describe("MeetingLinksDialog", () => {
  it("shows the direct Feishu meeting link before the LiveKit links", async () => {
    issueLinksMock.mockResolvedValue(links);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MeetingLinksDialog meeting={meeting} onOpenChange={vi.fn()} />
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("候选人链接");
    });

    const text = document.body.textContent ?? "";
    expect(text).toContain("飞书会议链接");
    expect(text.indexOf("飞书会议链接")).toBeLessThan(text.indexOf("候选人链接"));
    expect(document.body.innerHTML).toContain("https://vc.feishu.cn/j/123456789");
    expect(text).toContain("候选人链接");
    expect(text).toContain("面试官链接");

    act(() => root.unmount());
  });

  it("keeps LiveKit links visible and offers retry when Feishu sync failed", async () => {
    issueLinksMock.mockResolvedValue({
      ...links,
      feishu: {
        appLink: "https://applink.feishu.cn/client/video/123456789",
        calendarEventUrl: null,
        meetingUrl: "https://vc.feishu.cn/j/123456789",
        providerId: "feishu",
        status: "failed",
      },
    } satisfies HumanInterviewMeetingLinkBundle);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MeetingLinksDialog
            meeting={{
              ...meeting,
              feishu: {
                appLink: "https://applink.feishu.cn/client/video/123456789",
                calendarEventUrl: null,
                meetingUrl: "https://vc.feishu.cn/j/123456789",
                providerId: "feishu",
                status: "failed",
              },
            }}
            onOpenChange={vi.fn()}
          />
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("候选人链接");
    });

    const text = document.body.textContent ?? "";
    expect(text).toContain("飞书同步失败");
    expect(text).toContain("重试飞书同步");
    expect(text).toContain("候选人链接");
    expect(text).toContain("面试官链接");

    act(() => root.unmount());
  });

  it.each([
    { buttonLabel: "继续飞书同步", status: "pending" as const, statusLabel: "尚未完成" },
    { buttonLabel: "检查并恢复同步", status: "creating" as const, statusLabel: "可能仍在进行" },
  ])("offers recovery when Feishu sync is $status", async (scenario) => {
    issueLinksMock.mockResolvedValue({
      ...links,
      feishu: {
        appLink: null,
        calendarEventUrl: null,
        meetingUrl: null,
        providerId: "feishu",
        status: scenario.status,
      },
    } satisfies HumanInterviewMeetingLinkBundle);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MeetingLinksDialog
            meeting={{
              ...meeting,
              feishu: {
                appLink: null,
                calendarEventUrl: null,
                meetingUrl: null,
                providerId: "feishu",
                status: scenario.status,
              },
            }}
            onOpenChange={vi.fn()}
          />
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain(scenario.statusLabel);
    });

    const text = document.body.textContent ?? "";
    expect(text).toContain(scenario.buttonLabel);
    expect(text).toContain("候选人链接");
    expect(text).toContain("面试官链接");

    act(() => root.unmount());
  });

  it("asks for manual verification and hides retry when the reserve result is unknown", async () => {
    issueLinksMock.mockResolvedValue({
      ...links,
      feishu: {
        appLink: null,
        calendarEventUrl: null,
        meetingUrl: null,
        providerId: "feishu",
        status: "unknown",
      },
    } satisfies HumanInterviewMeetingLinkBundle);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MeetingLinksDialog
            meeting={{
              ...meeting,
              feishu: {
                appLink: null,
                calendarEventUrl: null,
                meetingUrl: null,
                providerId: "feishu",
                status: "unknown",
              },
            }}
            onOpenChange={vi.fn()}
          />
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("人工核查");
    });

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("重试飞书同步");
    expect(text).toContain("候选人链接");
    expect(text).toContain("面试官链接");

    act(() => root.unmount());
  });
});
