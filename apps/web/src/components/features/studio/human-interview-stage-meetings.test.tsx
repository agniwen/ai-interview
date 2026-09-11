// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  HumanInterviewMeetingLinkBundle,
  HumanInterviewMeetingRecord,
} from "@app/shared/studio-pipeline-stages";
import {
  buildCandidateLinkCopy,
  buildInterviewerLinkCopy,
  MeetingLinksDialogView,
} from "./human-interview-stage-meetings";

// SAFETY: This test constructs the value with the asserted contract before this boundary.
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

const issueLinksMock = vi.fn();
const meetingLinksDependencies = {
  issueLinks: issueLinksMock,
  retryFeishu: vi.fn(),
  slug: "test-workspace",
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

const meeting: HumanInterviewMeetingRecord = {
  attendanceAlertedAt: null,
  cancelledAt: null,
  createdAt: "2026-08-05T09:00:00.000Z",
  createdBy: "operator-1",
  endedAt: null,
  establishedAt: null,
  feishu: {
    appLink: null,
    calendarEventUrl: "https://applink.feishu.cn/client/calendar/event/event-1",
    meetingUrl: null,
    providerId: "feishu",
    status: "ready",
  },
  id: "meeting-1",
  interviewers: [],
  lifecycleOccurredAt: null,
  lifecycleSource: null,
  liveKitRoomName: "human-interview-meeting-1",
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
  title: "张三 - 真人面试",
  updatedAt: "2026-08-05T09:00:00.000Z",
  validUntil: "2026-08-06T09:30:00.000Z",
};

const links: HumanInterviewMeetingLinkBundle = {
  candidateLinks: [
    {
      candidateName: "张三",
      companyName: "示例科技",
      expiresAt: "2026-08-06T09:30:00.000Z",
      interviewRecordId: "candidate-1",
      jobDescriptionName: "前端技术经理",
      roundId: "round-1",
      roundLabel: "真人面试",
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
  it("builds candidate and interviewer messages that can be sent directly", () => {
    expect(
      buildCandidateLinkCopy({
        candidateName: "张三",
        companyName: "示例科技",
        jobDescriptionName: "前端技术经理",
        roundLabel: "业务六面",
        scheduledAt: "2026-08-05T09:30:00.000Z",
        url: "https://interview.example.test/human-interview/candidate-token",
      }),
    ).toBe(
      "张三，您好：\n这是您的真人面试确认链接。\n公司：示例科技\n应聘岗位：前端技术经理\n面试轮次：业务六面\n面试时间：2026-08-05 17:30\n请打开链接确认是否参加，本链接仅供本人使用，请勿转发。\nhttps://interview.example.test/human-interview/candidate-token",
    );
    expect(
      buildInterviewerLinkCopy({
        interviewerName: "光芒",
        jobDescriptionName: "前端技术经理",
        meetingTitle: "张三 - 业务六面",
        roleLabel: "面试官",
        scheduledAt: "2026-08-05T09:30:00.000Z",
        url: "https://interview.example.test/human-interview/interviewer/interviewer-token",
      }),
    ).toBe(
      "光芒，您好：\n这是「张三 - 业务六面」真人面试的面试官会议链接。\n岗位：前端技术经理\n面试时间：2026-08-05 17:30\n您本次的会议身份为面试官，请使用本人账号打开，本链接请勿转发。\nhttps://interview.example.test/human-interview/interviewer/interviewer-token",
    );
  });

  it("hides Feishu details while keeping candidate and interviewer links visible", async () => {
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
          <MeetingLinksDialogView
            dependencies={meetingLinksDependencies}
            meeting={meeting}
            onOpenChange={vi.fn()}
          />
        </QueryClientProvider>,
      );
    });
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("候选人确认链接");
    });

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("飞书日程");
    expect(document.body.innerHTML).not.toContain(
      "https://applink.feishu.cn/client/calendar/event/event-1",
    );
    expect(text).not.toContain("飞书会议链接");
    expect(text).toContain("候选人确认链接");
    expect(text).toContain("面试官会议链接");
    expect(text).toContain("可直接发送给候选人");
    expect(text).toContain("可直接发送给面试官");
    expect(text.match(/复制消息/g)).toHaveLength(2);

    act(() => root.unmount());
  });

  it("keeps LiveKit links visible and offers retry when Feishu sync failed", async () => {
    issueLinksMock.mockResolvedValue({
      ...links,
      feishu: {
        appLink: null,
        calendarEventUrl: null,
        meetingUrl: null,
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
          <MeetingLinksDialogView
            dependencies={meetingLinksDependencies}
            meeting={{
              ...meeting,
              feishu: {
                appLink: null,
                calendarEventUrl: null,
                meetingUrl: null,
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
      expect(document.body.textContent).toContain("候选人确认链接");
    });

    const text = document.body.textContent ?? "";
    expect(text).toContain("飞书日程同步失败");
    expect(text).toContain("重试飞书同步");
    expect(text).toContain("候选人确认链接");
    expect(text).toContain("面试官会议链接");

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
          <MeetingLinksDialogView
            dependencies={meetingLinksDependencies}
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
    expect(text).toContain("候选人确认链接");
    expect(text).toContain("面试官会议链接");

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
          <MeetingLinksDialogView
            dependencies={meetingLinksDependencies}
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
    expect(text).toContain("候选人确认链接");
    expect(text).toContain("面试官会议链接");

    act(() => root.unmount());
  });
});
