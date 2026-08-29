/* oxlint-disable max-lines, prefer-response-static-json, require-await -- end-to-end route scenarios keep sequential Feishu checkpoints readable. */

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { publicRouter } from "@arc/ai-recruitment-copilot-backend/server/routes/public/route";
import { issueHumanInterviewMeetingLinks } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/human-interview-meetings";
import {
  account,
  interviewAuditLog,
  member,
  organization,
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingInterviewer,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
  studioHumanInterviewRoundInterviewer,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import { createStudioInterviewCollectionRouter } from "../collection-route";

const studioInterviewCollectionRouter = createStudioInterviewCollectionRouter({
  humanMeetingUpdateAccess: () => async (_c, next) => next(),
  permission: () => async (_c, next) => next(),
});

const INTERVIEWER_ID = "test_feishu_meeting_interviewer";
const INTERVIEW_ID = "test_feishu_meeting_candidate";
const NOW = new Date("2026-08-05T09:00:00.000Z");
const OPERATOR_ID = "test_feishu_meeting_operator";
const ORG_ID = "test_feishu_meeting_org";
const OUTSIDER_ID = "test_feishu_meeting_outsider";
const PRIMARY_INTERVIEWER_ID = "test_feishu_meeting_primary_interviewer";
const ROUND_ID = "test_feishu_meeting_round";
const SECOND_INTERVIEW_ID = "test_feishu_meeting_candidate_2";
const SECOND_ROUND_ID = "test_feishu_meeting_round_2";
const SECONDARY_INTERVIEWER_ID = "test_feishu_meeting_secondary_interviewer";

async function setRoundInterviewers(userIds: string[]) {
  await db
    .delete(studioHumanInterviewRoundInterviewer)
    .where(eq(studioHumanInterviewRoundInterviewer.roundId, ROUND_ID));
  await db.insert(studioHumanInterviewRoundInterviewer).values(
    userIds.map((userId) => ({
      roundId: ROUND_ID,
      userId,
    })),
  );
}

async function seedReadyFeishuMeeting(meetingId: string, roundIds = [ROUND_ID]) {
  await db.insert(studioHumanInterviewMeeting).values({
    createdAt: NOW,
    createdBy: OPERATOR_ID,
    feishuAppLink: "https://applink.feishu.cn/client/video/123456789",
    feishuAttendeeOpenIds: ["ou_interviewer_secondary"],
    feishuCalendarEventId: "event_route_schedule_update",
    feishuCalendarEventUrl:
      "https://applink.feishu.cn/client/calendar/event/detail?key=event_retry",
    feishuCalendarId: "feishu.cn_bot@group.calendar.feishu.cn",
    feishuMeetingNo: "123456789",
    feishuMeetingUrl: "https://vc.feishu.cn/j/123456789",
    feishuOwnerOpenId: "ou_interviewer_secondary",
    feishuProviderId: "feishu-jiguang-hr",
    feishuReserveId: "reserve_route_schedule_update",
    feishuSyncStatus: "ready",
    feishuSyncedAt: NOW,
    id: meetingId,
    liveKitRoomName: `human_${meetingId}`,
    organizationId: ORG_ID,
    scheduledAt: new Date("2026-08-05T09:30:00.000Z"),
    status: "scheduled",
    title: "张三 - 真人复面",
    updatedAt: NOW,
    validUntil: new Date("2026-08-05T10:30:00.000Z"),
  });
  await db
    .insert(studioHumanInterviewMeetingRound)
    .values(roundIds.map((roundId) => ({ meetingId, roundId })));
  await db.insert(studioHumanInterviewMeetingInterviewer).values({
    feishuOpenId: "ou_interviewer_secondary",
    meetingId,
    role: "host",
    userId: INTERVIEWER_ID,
  });
}

async function cleanup() {
  await db
    .delete(studioHumanInterviewMeeting)
    .where(eq(studioHumanInterviewMeeting.organizationId, ORG_ID));
  await db
    .delete(studioHumanInterviewRound)
    .where(eq(studioHumanInterviewRound.organizationId, ORG_ID));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_ID));
  await db.delete(account).where(eq(account.userId, OPERATOR_ID));
  await db.delete(account).where(eq(account.userId, INTERVIEWER_ID));
  await db.delete(account).where(eq(account.userId, PRIMARY_INTERVIEWER_ID));
  await db.delete(account).where(eq(account.userId, SECONDARY_INTERVIEWER_ID));
  await db.delete(member).where(eq(member.organizationId, ORG_ID));
  await db.delete(organization).where(eq(organization.id, ORG_ID));
  await db.delete(user).where(eq(user.id, OPERATOR_ID));
  await db.delete(user).where(eq(user.id, INTERVIEWER_ID));
  await db.delete(user).where(eq(user.id, OUTSIDER_ID));
  await db.delete(user).where(eq(user.id, PRIMARY_INTERVIEWER_ID));
  await db.delete(user).where(eq(user.id, SECONDARY_INTERVIEWER_ID));
}

function makeApp(authProviderId: string | null) {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      c.set("activeOrg", {
        createdAt: NOW,
        id: ORG_ID,
        logo: null,
        metadata: null,
        name: "飞书会议测试工作区",
        slug: ORG_ID,
      });
      c.set("member", null);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("session", {
        authProviderId,
        createdAt: NOW,
        expiresAt: new Date("2026-08-12T09:00:00.000Z"),
        id: "test_feishu_meeting_session",
        ipAddress: null,
        token: "session-token",
        updatedAt: NOW,
        userAgent: null,
        userId: OPERATOR_ID,
      } as never);
      c.set("user", {
        banExpires: null,
        banReason: null,
        banned: false,
        createdAt: NOW,
        email: "operator-feishu-meeting@example.com",
        emailVerified: true,
        feishuTenantKey: null,
        feishuTenantName: null,
        id: OPERATOR_ID,
        image: null,
        name: "操作人",
        role: null,
        updatedAt: NOW,
      });
      await next();
    })
    .route("/", studioInterviewCollectionRouter);
}

beforeAll(async () => {
  process.env.FEISHU_APP_ID = "cli_test_feishu_primary";
  process.env.FEISHU_APP_SECRET = "primary-secret";
  process.env.FEISHU_APP_ID2 = "cli_test_feishu_secondary";
  process.env.FEISHU_APP_SECRET2 = "secondary-secret";
  await cleanup();
  await db.insert(user).values([
    {
      createdAt: NOW,
      email: "operator-feishu-meeting@example.com",
      emailVerified: true,
      id: OPERATOR_ID,
      name: "操作人",
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      email: "interviewer-feishu-meeting@example.com",
      emailVerified: true,
      id: INTERVIEWER_ID,
      name: "光芒",
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      email: "outsider-feishu-meeting@example.com",
      emailVerified: true,
      id: OUTSIDER_ID,
      name: "外部用户",
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      email: "primary-interviewer-feishu-meeting@example.com",
      emailVerified: true,
      id: PRIMARY_INTERVIEWER_ID,
      name: "第一应用面试官",
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      email: "secondary-interviewer-feishu-meeting@example.com",
      emailVerified: true,
      id: SECONDARY_INTERVIEWER_ID,
      name: "极光 HR 面试官",
      updatedAt: NOW,
    },
  ]);
  await db.insert(organization).values({
    createdAt: NOW,
    id: ORG_ID,
    name: "飞书会议测试工作区",
    slug: ORG_ID,
  });
  await db.insert(member).values([
    {
      createdAt: NOW,
      id: "test_feishu_meeting_member_operator",
      organizationId: ORG_ID,
      role: "owner",
      userId: OPERATOR_ID,
    },
    {
      createdAt: NOW,
      id: "test_feishu_meeting_member_interviewer",
      organizationId: ORG_ID,
      role: "member",
      userId: INTERVIEWER_ID,
    },
    {
      createdAt: NOW,
      id: "test_feishu_meeting_member_primary_interviewer",
      organizationId: ORG_ID,
      role: "member",
      userId: PRIMARY_INTERVIEWER_ID,
    },
    {
      createdAt: NOW,
      id: "test_feishu_meeting_member_secondary_interviewer",
      organizationId: ORG_ID,
      role: "member",
      userId: SECONDARY_INTERVIEWER_ID,
    },
  ]);
  await db.insert(account).values([
    {
      accountId: "ou_operator_primary",
      createdAt: NOW,
      id: "test_feishu_meeting_account_operator",
      issuer: "local:oauth:feishu",
      providerId: "feishu",
      updatedAt: NOW,
      userId: OPERATOR_ID,
    },
    {
      accountId: "ou_interviewer_primary",
      createdAt: NOW,
      id: "test_feishu_meeting_account_interviewer",
      issuer: "local:oauth:feishu",
      providerId: "feishu",
      updatedAt: NOW,
      userId: INTERVIEWER_ID,
    },
    {
      accountId: "ou_operator_secondary",
      createdAt: NOW,
      id: "test_feishu_meeting_account_operator_secondary",
      issuer: "local:oauth:feishu-jiguang-hr",
      providerId: "feishu-jiguang-hr",
      updatedAt: NOW,
      userId: OPERATOR_ID,
    },
    {
      accountId: "ou_interviewer_secondary",
      createdAt: NOW,
      id: "test_feishu_meeting_account_interviewer_secondary",
      issuer: "local:oauth:feishu-jiguang-hr",
      providerId: "feishu-jiguang-hr",
      updatedAt: NOW,
      userId: INTERVIEWER_ID,
    },
    {
      accountId: "ou_primary_interviewer",
      createdAt: NOW,
      id: "test_feishu_meeting_account_primary_interviewer",
      issuer: "local:oauth:feishu",
      providerId: "feishu",
      updatedAt: NOW,
      userId: PRIMARY_INTERVIEWER_ID,
    },
    {
      accountId: "ou_secondary_interviewer",
      createdAt: NOW,
      id: "test_feishu_meeting_account_secondary_interviewer",
      issuer: "local:oauth:feishu-jiguang-hr",
      providerId: "feishu-jiguang-hr",
      updatedAt: NOW,
      userId: SECONDARY_INTERVIEWER_ID,
    },
  ]);
  await db.insert(studioInterview).values([
    {
      candidateName: "张三",
      createdAt: NOW,
      createdBy: OPERATOR_ID,
      id: INTERVIEW_ID,
      organizationId: ORG_ID,
      updatedAt: NOW,
    },
    {
      candidateName: "李四",
      createdAt: NOW,
      createdBy: OPERATOR_ID,
      id: SECOND_INTERVIEW_ID,
      organizationId: ORG_ID,
      updatedAt: NOW,
    },
  ]);
  await db.insert(studioHumanInterviewRound).values([
    {
      createdAt: NOW,
      format: "online",
      id: ROUND_ID,
      interviewRecordId: INTERVIEW_ID,
      label: "真人复面",
      organizationId: ORG_ID,
      scheduledAt: new Date("2026-08-05T09:30:00.000Z"),
      sortOrder: 0,
      status: "pending",
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      format: "online",
      id: SECOND_ROUND_ID,
      interviewRecordId: SECOND_INTERVIEW_ID,
      label: "真人复面",
      organizationId: ORG_ID,
      scheduledAt: new Date("2026-08-05T09:30:00.000Z"),
      sortOrder: 0,
      status: "pending",
      updatedAt: NOW,
    },
  ]);
});

afterAll(cleanup);

beforeEach(async () => {
  vi.restoreAllMocks();
  process.env.FEISHU_APP_ID = "cli_test_feishu_primary";
  process.env.FEISHU_APP_ID2 = "cli_test_feishu_secondary";
  process.env.FEISHU_HUMAN_INTERVIEW_ENABLED = "true";
  await db.delete(interviewAuditLog).where(eq(interviewAuditLog.organizationId, ORG_ID));
  await db
    .delete(studioHumanInterviewMeeting)
    .where(eq(studioHumanInterviewMeeting.organizationId, ORG_ID));
  await setRoundInterviewers([INTERVIEWER_ID]);
});

describe("LiveKit entry with synchronized Feishu meetings", () => {
  it("issues an interviewer token instead of redirecting to Feishu", async () => {
    const meetingId = "test_feishu_meeting_livekit_entry";
    await seedReadyFeishuMeeting(meetingId);
    const currentTime = new Date();
    await db
      .update(studioHumanInterviewMeeting)
      .set({
        scheduledAt: currentTime,
        validUntil: new Date(currentTime.getTime() + 60 * 60 * 1000),
      })
      .where(eq(studioHumanInterviewMeeting.id, meetingId));
    process.env.LIVEKIT_API_KEY = "test-livekit-key";
    process.env.LIVEKIT_API_SECRET = "test-livekit-secret";
    process.env.LIVEKIT_URL = "wss://livekit.example.test";

    const links = await issueHumanInterviewMeetingLinks({ meetingId, organizationId: ORG_ID });
    const interviewerUrl = links.interviewerLinks[0]?.url;
    expect(interviewerUrl).toBeDefined();
    const inviteToken = interviewerUrl?.split("/").at(-1);
    expect(inviteToken).toBeDefined();

    const response = await factory
      .createApp()
      .route("/", publicRouter)
      .request(`/human-interview-meetings/interviewer/${inviteToken}/livekit-token`, {
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      participantName: "光芒",
      roomName: `human_${meetingId}`,
    });
  });
});

describe("POST /human-interview-meetings", () => {
  it("creates a LiveKit-only meeting without calling Feishu when the integration is disabled", async () => {
    process.env.FEISHU_HUMAN_INTERVIEW_ENABLED = "false";
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await makeApp("feishu").request("/human-interview-meetings", {
      body: JSON.stringify({
        interviewerIds: [PRIMARY_INTERVIEWER_ID, SECONDARY_INTERVIEWER_ID],
        notes: null,
        roundIds: [ROUND_ID],
        scheduledAt: "2026-08-05T09:30:00.000Z",
        title: "张三 - 真人复面",
        validUntil: "2026-08-06T09:30:00.000Z",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    expect((await response.json()) as { feishu: unknown }).toMatchObject({ feishu: null });
  });

  it("creates only a Feishu calendar event with each interviewer's own system link", async () => {
    process.env.BETTER_AUTH_URL = "https://interview.example.test";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            expire: 7200,
            msg: "success",
            tenant_access_token: "secondary-tenant-token",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              calendars: [
                {
                  calendar: {
                    calendar_id: "feishu.cn_bot@group.calendar.feishu.cn",
                    role: "owner",
                  },
                },
              ],
            },
            msg: "success",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              event: {
                app_link: "https://applink.feishu.cn/client/calendar/event/detail?key=event_1",
                event_id: "event_route_1",
              },
            },
            msg: "success",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              attendees: [{ user_id: "ou_interviewer_secondary" }],
            },
            msg: "success",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      );

    const response = await makeApp("feishu").request("/human-interview-meetings", {
      body: JSON.stringify({
        interviewerIds: [INTERVIEWER_ID],
        notes: "请重点关注系统设计能力",
        roundIds: [ROUND_ID],
        scheduledAt: "2026-08-05T09:30:00.000Z",
        title: "张三 - 真人复面",
        validUntil: "2026-08-06T09:30:00.000Z",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
    const tenantTokenRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("tenant_access_token/internal"),
    );
    expect(JSON.parse(String(tenantTokenRequest?.[1]?.body))).toEqual({
      app_id: "cli_test_feishu_secondary",
      app_secret: "secondary-secret",
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/vc/"))).toBe(false);
    const calendarRequest = fetchMock.mock.calls.find(
      ([url]) =>
        String(url).includes("/calendar/v4/calendars/") && String(url).includes("/events?"),
    );
    // SAFETY: The mocked request body is the calendar JSON payload produced by this route.
    const calendarBody = JSON.parse(String(calendarRequest?.[1]?.body)) as {
      description?: string;
    };
    expect(calendarBody.description).toContain("真人复面安排");
    expect(calendarBody.description).toContain("候选人：张三");
    expect(calendarBody.description).toContain("面试轮次：真人复面");
    expect(calendarBody.description).toContain("面试官：光芒（主持人）");
    expect(calendarBody.description).toContain("在线面试入口（请点击本人对应的链接）");
    expect(calendarBody.description).toContain(
      "光芒（主持人）：https://interview.example.test/human-interview/interviewer/",
    );
    expect(calendarBody.description).toContain("请重点关注系统设计能力");
    expect(calendarBody.description).toContain(
      "本日程仅用于面试安排，在线面试将在招聘系统中进行。",
    );
    const attendeeRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/attendees"),
    );
    expect(JSON.parse(String(attendeeRequest?.[1]?.body))).toEqual({
      attendees: [{ type: "user", user_id: "ou_interviewer_secondary" }],
      need_notification: true,
    });
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const body = (await response.json()) as {
      feishu?: {
        calendarEventUrl?: string;
        meetingUrl?: string | null;
        providerId?: string;
        status?: string;
      };
    };
    expect(body.feishu?.providerId).toBe("feishu-jiguang-hr");
    expect(body.feishu?.status).toBe("ready");
    expect(body.feishu?.calendarEventUrl).toBe(
      "https://applink.feishu.cn/client/calendar/event/detail?key=event_1",
    );
    expect(body.feishu?.meetingUrl).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("keeps an existing Feishu meeting on the LiveKit-only path when the integration is disabled", async () => {
    const meetingId = "test_feishu_meeting_disabled_reschedule";
    await seedReadyFeishuMeeting(meetingId);
    process.env.FEISHU_HUMAN_INTERVIEW_ENABLED = "false";
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await makeApp("feishu").request(`/human-interview-meetings/${meetingId}`, {
      body: JSON.stringify({
        scheduledAt: "2026-08-05T11:30:00.000Z",
        validUntil: "2026-08-05T12:30:00.000Z",
      }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    expect((await response.json()) as { scheduledAt: string }).toMatchObject({
      scheduledAt: "2026-08-05T11:30:00.000Z",
    });

    const retryResponse = await makeApp("feishu").request(
      `/human-interview-meetings/${meetingId}/feishu-sync`,
      { method: "POST" },
    );
    expect(retryResponse.status).toBe(409);
    await expect(retryResponse.json()).resolves.toEqual({ error: "飞书真人面试功能未启用。" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("updates only the existing Feishu calendar event when the meeting time changes", async () => {
    process.env.BETTER_AUTH_URL = "https://interview.example.test";
    const meetingId = "test_feishu_schedule_update";
    await seedReadyFeishuMeeting(meetingId);
    await db
      .update(studioHumanInterviewMeeting)
      .set({ feishuSyncStatus: "failed", feishuSyncedAt: null })
      .where(eq(studioHumanInterviewMeeting.id, meetingId));
    process.env.FEISHU_APP_ID2 = "cli_test_feishu_schedule_update";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            expire: 7200,
            msg: "success",
            tenant_access_token: "schedule-update-token",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, data: {}, msg: "success" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    const app = makeApp("feishu");
    const response = await app.request(`/human-interview-meetings/${meetingId}`, {
      body: JSON.stringify({
        scheduledAt: "2026-08-05T10:30:00.000Z",
        validUntil: "2026-08-05T11:30:00.000Z",
      }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });

    expect(response.status).toBe(200);
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const body = (await response.json()) as {
      feishu?: { status?: string };
      scheduledAt?: string;
      validUntil?: string;
    };
    expect(body).toMatchObject({
      feishu: { status: "ready" },
      scheduledAt: "2026-08-05T10:30:00.000Z",
      validUntil: "2026-08-05T11:30:00.000Z",
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/vc/"))).toBe(false);
    const calendarUpdate = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/events/event_route_schedule_update"),
    );
    expect(calendarUpdate?.[1]?.method).toBe("PATCH");
    expect(JSON.parse(String(calendarUpdate?.[1]?.body))).toEqual({
      description: expect.stringContaining(
        "光芒（主持人）：https://interview.example.test/human-interview/interviewer/",
      ),
      end_time: { timestamp: "1785929400", timezone: "Asia/Shanghai" },
      need_notification: true,
      start_time: { timestamp: "1785925800", timezone: "Asia/Shanghai" },
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/reserves/apply"))).toBe(
      false,
    );
    const [updatedRound] = await db
      .select({ scheduledAt: studioHumanInterviewRound.scheduledAt })
      .from(studioHumanInterviewRound)
      .where(eq(studioHumanInterviewRound.id, ROUND_ID));
    expect(updatedRound?.scheduledAt?.toISOString()).toBe("2026-08-05T10:30:00.000Z");
  });

  it("records a reschedule activity for every candidate linked to the meeting", async () => {
    const meetingId = "test_feishu_group_schedule_update";
    await seedReadyFeishuMeeting(meetingId, [ROUND_ID, SECOND_ROUND_ID]);
    process.env.FEISHU_APP_ID2 = "cli_test_feishu_group_schedule_update";
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            expire: 7200,
            msg: "success",
            tenant_access_token: "group-schedule-update-token",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      )
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ code: 0, data: {}, msg: "success" }), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
      );

    const response = await makeApp("feishu").request(`/human-interview-meetings/${meetingId}`, {
      body: JSON.stringify({
        scheduledAt: "2026-08-05T10:30:00.000Z",
        validUntil: "2026-08-05T11:30:00.000Z",
      }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });

    expect(response.status).toBe(200);
    const activities = await db
      .select({
        action: interviewAuditLog.action,
        detail: interviewAuditLog.detail,
        interviewRecordId: interviewAuditLog.interviewRecordId,
        operatorId: interviewAuditLog.operatorId,
      })
      .from(interviewAuditLog)
      .where(eq(interviewAuditLog.organizationId, ORG_ID));
    expect(
      activities.toSorted((left, right) =>
        left.interviewRecordId.localeCompare(right.interviewRecordId),
      ),
    ).toEqual([
      {
        action: "human_interview_round_updated",
        detail: {
          roundId: ROUND_ID,
          roundLabel: "真人复面",
          scheduledAt: "2026-08-05T10:30:00.000Z",
        },
        interviewRecordId: INTERVIEW_ID,
        operatorId: OPERATOR_ID,
      },
      {
        action: "human_interview_round_updated",
        detail: {
          roundId: SECOND_ROUND_ID,
          roundLabel: "真人复面",
          scheduledAt: "2026-08-05T10:30:00.000Z",
        },
        interviewRecordId: SECOND_INTERVIEW_ID,
        operatorId: OPERATOR_ID,
      },
    ]);
  });

  it("keeps the changed local time retryable when the Feishu calendar update fails", async () => {
    const meetingId = "test_feishu_reschedule_retry";
    await seedReadyFeishuMeeting(meetingId);
    process.env.FEISHU_APP_ID2 = "cli_test_feishu_reschedule_retry";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            expire: 7200,
            msg: "success",
            tenant_access_token: "reschedule-retry-token",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 12_345, msg: "calendar update denied" }), {
          headers: { "content-type": "application/json" },
          status: 403,
        }),
      );

    const app = makeApp("feishu");
    const response = await app.request(`/human-interview-meetings/${meetingId}`, {
      body: JSON.stringify({
        scheduledAt: "2026-08-05T10:30:00.000Z",
        validUntil: "2026-08-05T11:30:00.000Z",
      }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "飞书日程更新时间失败：calendar update denied",
      feishuStatus: "failed",
      meetingId,
    });
    const [failedMeeting] = await db
      .select({
        scheduledAt: studioHumanInterviewMeeting.scheduledAt,
        status: studioHumanInterviewMeeting.feishuSyncStatus,
        validUntil: studioHumanInterviewMeeting.validUntil,
      })
      .from(studioHumanInterviewMeeting)
      .where(eq(studioHumanInterviewMeeting.id, meetingId));
    expect(failedMeeting).toMatchObject({ status: "failed" });
    expect(failedMeeting?.scheduledAt?.toISOString()).toBe("2026-08-05T10:30:00.000Z");
    expect(failedMeeting?.validUntil?.toISOString()).toBe("2026-08-05T11:30:00.000Z");
    const failedSyncActivities = await db
      .select({
        action: interviewAuditLog.action,
        interviewRecordId: interviewAuditLog.interviewRecordId,
      })
      .from(interviewAuditLog)
      .where(eq(interviewAuditLog.organizationId, ORG_ID));
    expect(failedSyncActivities).toEqual([
      {
        action: "human_interview_round_updated",
        interviewRecordId: INTERVIEW_ID,
      },
    ]);

    fetchMock.mockReset().mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 0, data: {}, msg: "success" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    const retryResponse = await app.request(`/human-interview-meetings/${meetingId}/feishu-sync`, {
      method: "POST",
    });

    expect(retryResponse.status).toBe(200);
    await expect(retryResponse.json()).resolves.toMatchObject({
      feishu: { status: "ready" },
      scheduledAt: "2026-08-05T10:30:00.000Z",
      validUntil: "2026-08-05T11:30:00.000Z",
    });
    expect(fetchMock.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
  });

  it("rejects interviewers without a common Feishu app before calling Feishu", async () => {
    await setRoundInterviewers([PRIMARY_INTERVIEWER_ID, SECONDARY_INTERVIEWER_ID]);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await makeApp("feishu").request("/human-interview-meetings", {
      body: JSON.stringify({
        interviewerIds: [PRIMARY_INTERVIEWER_ID, SECONDARY_INTERVIEWER_ID],
        notes: null,
        roundIds: [ROUND_ID],
        scheduledAt: "2026-08-05T09:30:00.000Z",
        title: "张三 - 真人复面",
        validUntil: "2026-08-06T09:30:00.000Z",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "所选面试官不属于同一个飞书应用来源。",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a retryable failed state when calendar creation fails", async () => {
    process.env.FEISHU_APP_ID2 = "cli_test_feishu_secondary_calendar_failure";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            expire: 7200,
            msg: "success",
            tenant_access_token: "secondary-tenant-token",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              calendars: [
                {
                  calendar: {
                    calendar_id: "feishu.cn_bot_secondary@group.calendar.feishu.cn",
                    role: "owner",
                  },
                },
              ],
            },
            msg: "success",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 12_345, msg: "calendar permission denied" }), {
          headers: { "content-type": "application/json" },
          status: 403,
        }),
      );

    const app = makeApp("google");
    const response = await app.request("/human-interview-meetings", {
      body: JSON.stringify({
        interviewerIds: [INTERVIEWER_ID],
        notes: null,
        roundIds: [ROUND_ID],
        scheduledAt: "2026-08-05T09:30:00.000Z",
        title: "张三 - 真人复面",
        validUntil: "2026-08-06T09:30:00.000Z",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(502);
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const failureBody = (await response.json()) as {
      error: string;
      feishuStatus: string;
      meetingId: string;
    };
    expect(failureBody).toEqual({
      error: "飞书日程创建失败：calendar permission denied",
      feishuStatus: "failed",
      meetingId: expect.any(String),
    });
    const tenantTokenRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("tenant_access_token/internal"),
    );
    expect(JSON.parse(String(tenantTokenRequest?.[1]?.body))).toEqual({
      app_id: "cli_test_feishu_secondary_calendar_failure",
      app_secret: "secondary-secret",
    });

    await db
      .update(studioHumanInterviewMeeting)
      .set({
        feishuSyncStatus: "creating",
        updatedAt: new Date("2026-08-05T08:00:00.000Z"),
      })
      .where(eq(studioHumanInterviewMeeting.id, failureBody.meetingId));
    await db
      .update(account)
      .set({ accountId: "ou_operator_secondary_changed" })
      .where(eq(account.id, "test_feishu_meeting_account_operator_secondary"));
    await db
      .update(account)
      .set({ accountId: "ou_interviewer_secondary_changed" })
      .where(eq(account.id, "test_feishu_meeting_account_interviewer_secondary"));

    fetchMock
      .mockReset()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              event: {
                app_link: "https://applink.feishu.cn/client/calendar/event/detail?key=event_retry",
                event_id: "event_route_retry",
              },
            },
            msg: "success",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              attendees: [{ user_id: "ou_interviewer_secondary" }],
            },
            msg: "success",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      );

    let retryResponse: Response;
    try {
      retryResponse = await app.request(
        `/human-interview-meetings/${failureBody.meetingId}/feishu-sync`,
        { method: "POST" },
      );
    } finally {
      await db
        .update(account)
        .set({ accountId: "ou_operator_secondary" })
        .where(eq(account.id, "test_feishu_meeting_account_operator_secondary"));
      await db
        .update(account)
        .set({ accountId: "ou_interviewer_secondary" })
        .where(eq(account.id, "test_feishu_meeting_account_interviewer_secondary"));
    }

    expect(retryResponse.status).toBe(200);
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const retryBody = (await retryResponse.json()) as {
      feishu?: { meetingUrl?: string | null; status?: string };
    };
    expect(retryBody.feishu).toMatchObject({
      meetingUrl: null,
      status: "ready",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const attendeeRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/attendees"),
    );
    expect(JSON.parse(String(attendeeRequest?.[1]?.body))).toEqual({
      attendees: [{ type: "user", user_id: "ou_interviewer_secondary" }],
      need_notification: true,
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/vc/"))).toBe(false);
  });

  it("persists a retryable failed state when the tenant token request fails", async () => {
    const originalSecondaryAppId = process.env.FEISHU_APP_ID2;
    process.env.FEISHU_APP_ID2 = "cli_test_feishu_secondary_token_failure";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 99_991_663, msg: "invalid app secret" }), {
        headers: { "content-type": "application/json" },
        status: 400,
      }),
    );

    try {
      const response = await makeApp("google").request("/human-interview-meetings", {
        body: JSON.stringify({
          interviewerIds: [INTERVIEWER_ID],
          notes: null,
          roundIds: [ROUND_ID],
          scheduledAt: "2026-08-05T09:30:00.000Z",
          title: "张三 - 真人复面",
          validUntil: "2026-08-06T09:30:00.000Z",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      expect(response.status).toBe(502);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      const failureBody = (await response.json()) as {
        feishuStatus: string;
        meetingId: string;
      };
      expect(failureBody).toMatchObject({
        feishuStatus: "failed",
        meetingId: expect.any(String),
      });
      const [persisted] = await db
        .select()
        .from(studioHumanInterviewMeeting)
        .where(eq(studioHumanInterviewMeeting.id, failureBody.meetingId));
      expect(persisted?.feishuSyncStatus).toBe("failed");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      process.env.FEISHU_APP_ID2 = originalSecondaryAppId;
    }
  });

  it("rejects more than ten interviewers before calling Feishu", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await makeApp("feishu").request("/human-interview-meetings", {
      body: JSON.stringify({
        interviewerIds: Array.from({ length: 11 }, () => INTERVIEWER_ID),
        notes: null,
        roundIds: [ROUND_ID],
        scheduledAt: "2026-08-05T09:30:00.000Z",
        title: "张三 - 真人复面",
        validUntil: "2026-08-06T09:30:00.000Z",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("derives meeting interviewers from the round instead of deprecated request input", async () => {
    process.env.FEISHU_HUMAN_INTERVIEW_ENABLED = "false";
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await makeApp("feishu").request("/human-interview-meetings", {
      body: JSON.stringify({
        interviewerIds: [OUTSIDER_ID],
        notes: null,
        roundIds: [ROUND_ID],
        scheduledAt: "2026-08-05T09:30:00.000Z",
        title: "张三 - 真人复面",
        validUntil: "2026-08-06T09:30:00.000Z",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      interviewers: [{ id: INTERVIEWER_ID }],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checkpoints partially added attendees and retries only the missing person", async () => {
    await setRoundInterviewers([INTERVIEWER_ID, SECONDARY_INTERVIEWER_ID]);
    const originalSecondaryAppId = process.env.FEISHU_APP_ID2;
    process.env.FEISHU_APP_ID2 = "cli_test_feishu_secondary_partial_attendees";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("tenant_access_token/internal")) {
        return new Response(
          JSON.stringify({
            code: 0,
            expire: 7200,
            msg: "success",
            tenant_access_token: "partial-attendee-token",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        );
      }
      if (url.includes("/calendars/primary")) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: { calendars: [{ calendar: { calendar_id: "calendar_partial" } }] },
            msg: "success",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        );
      }
      if (url.includes("/attendees")) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: { attendees: [{ user_id: "ou_interviewer_secondary" }] },
            msg: "success",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            event: {
              app_link: "https://applink.feishu.cn/event/partial",
              event_id: "event_partial_attendees",
            },
          },
          msg: "success",
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      );
    });

    try {
      const response = await makeApp("feishu").request("/human-interview-meetings", {
        body: JSON.stringify({
          interviewerIds: [INTERVIEWER_ID, SECONDARY_INTERVIEWER_ID],
          roundIds: [ROUND_ID],
          scheduledAt: "2026-08-05T09:30:00.000Z",
          title: "张三 - 真人复面",
          validUntil: "2026-08-06T09:30:00.000Z",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      expect(response.status).toBe(502);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      const failureBody = (await response.json()) as { meetingId: string };
      const [persisted] = await db
        .select({ attendeeOpenIds: studioHumanInterviewMeeting.feishuAttendeeOpenIds })
        .from(studioHumanInterviewMeeting)
        .where(eq(studioHumanInterviewMeeting.id, failureBody.meetingId));
      expect(persisted?.attendeeOpenIds).toEqual(["ou_interviewer_secondary"]);

      fetchMock.mockReset().mockImplementation(async (input, init) => {
        if (!String(input).includes("/attendees")) {
          return new Response(JSON.stringify({ code: 0, data: {}, msg: "success" }), {
            headers: { "content-type": "application/json" },
            status: 200,
          });
        }
        // SAFETY: This test constructs the value with the asserted contract before this boundary.
        const body = JSON.parse(String(init?.body)) as {
          attendees: { user_id: string }[];
        };
        expect(body.attendees).toEqual([{ type: "user", user_id: "ou_secondary_interviewer" }]);
        return new Response(
          JSON.stringify({
            code: 0,
            data: { attendees: [{ user_id: "ou_secondary_interviewer" }] },
            msg: "success",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        );
      });

      const retryResponse = await makeApp("feishu").request(
        `/human-interview-meetings/${failureBody.meetingId}/feishu-sync`,
        { method: "POST" },
      );
      expect(retryResponse.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).includes("/attendees")),
      ).toHaveLength(1);
    } finally {
      process.env.FEISHU_APP_ID2 = originalSecondaryAppId;
    }
  });

  it("keeps an interrupted calendar request safely retryable", async () => {
    const originalSecondaryAppId = process.env.FEISHU_APP_ID2;
    process.env.FEISHU_APP_ID2 = "cli_test_feishu_calendar_network_retry";
    process.env.BETTER_AUTH_URL = "https://interview.example.test";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({
          code: 0,
          expire: 7200,
          msg: "success",
          tenant_access_token: "calendar-network-retry-token",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          code: 0,
          data: { calendars: [{ calendar: { calendar_id: "calendar_network_retry" } }] },
          msg: "success",
        }),
      )
      .mockRejectedValueOnce(new TypeError("connection reset"));

    try {
      const response = await makeApp("feishu").request("/human-interview-meetings", {
        body: JSON.stringify({
          interviewerIds: [INTERVIEWER_ID],
          notes: null,
          roundIds: [ROUND_ID],
          scheduledAt: "2026-08-05T09:30:00.000Z",
          title: "张三 - 真人复面",
          validUntil: "2026-08-06T09:30:00.000Z",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      expect(response.status).toBe(502);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      const failureBody = (await response.json()) as {
        feishuStatus: string;
        meetingId: string;
      };
      expect(failureBody).toMatchObject({
        feishuStatus: "failed",
        meetingId: expect.any(String),
      });

      fetchMock
        .mockReset()
        .mockResolvedValueOnce(
          Response.json({
            code: 0,
            data: {
              event: {
                app_link: "https://applink.feishu.cn/event/network-retry",
                event_id: "event_network_retry",
              },
            },
            msg: "success",
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            code: 0,
            data: { attendees: [{ user_id: "ou_interviewer_secondary" }] },
            msg: "success",
          }),
        );
      const retryResponse = await makeApp("feishu").request(
        `/human-interview-meetings/${failureBody.meetingId}/feishu-sync`,
        { method: "POST" },
      );

      expect(retryResponse.status).toBe(200);
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/vc/"))).toBe(false);
    } finally {
      process.env.FEISHU_APP_ID2 = originalSecondaryAppId;
    }
  });

  it("allows only one concurrent retry to create a Feishu calendar event", async () => {
    const originalSecondaryAppId = process.env.FEISHU_APP_ID2;
    process.env.FEISHU_APP_ID2 = "cli_test_feishu_secondary_concurrent_retry";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("tenant_access_token/internal")) {
        return new Response(
          JSON.stringify({
            code: 0,
            expire: 7200,
            msg: "success",
            tenant_access_token: "concurrent-retry-token",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        );
      }
      return new Response(JSON.stringify({ code: 12_345, msg: "temporary calendar failure" }), {
        headers: { "content-type": "application/json" },
        status: 400,
      });
    });

    try {
      const app = makeApp("feishu");
      const createResponse = await app.request("/human-interview-meetings", {
        body: JSON.stringify({
          interviewerIds: [INTERVIEWER_ID],
          roundIds: [ROUND_ID],
          scheduledAt: "2026-08-05T09:30:00.000Z",
          title: "张三 - 真人复面",
          validUntil: "2026-08-06T09:30:00.000Z",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      expect(createResponse.status).toBe(502);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      const { meetingId } = (await createResponse.json()) as { meetingId: string };

      const { promise: calendarGate, resolve: releaseCalendar } = Promise.withResolvers<true>();
      let calendarCreateCallCount = 0;
      fetchMock.mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/events?")) {
          calendarCreateCallCount += 1;
          await calendarGate;
          return new Response(
            JSON.stringify({
              code: 0,
              data: {
                event: {
                  app_link: "https://applink.feishu.cn/event/concurrent",
                  event_id: "event_concurrent_retry",
                },
              },
              msg: "success",
            }),
            { headers: { "content-type": "application/json" }, status: 200 },
          );
        }
        if (url.includes("/calendars/primary")) {
          return new Response(
            JSON.stringify({
              code: 0,
              data: { calendars: [{ calendar: { calendar_id: "calendar_concurrent" } }] },
              msg: "success",
            }),
            { headers: { "content-type": "application/json" }, status: 200 },
          );
        }
        if (url.includes("/attendees")) {
          return new Response(
            JSON.stringify({
              code: 0,
              data: {
                attendees: [{ user_id: "ou_interviewer_secondary" }],
              },
              msg: "success",
            }),
            { headers: { "content-type": "application/json" }, status: 200 },
          );
        }
        throw new Error(`Unexpected Feishu request: ${url}`);
      });

      const retryPath = `/human-interview-meetings/${meetingId}/feishu-sync`;
      const firstRetry = app.request(retryPath, { method: "POST" });
      const secondRetry = app.request(retryPath, { method: "POST" });
      await vi.waitFor(() => expect(calendarCreateCallCount).toBeGreaterThanOrEqual(1), {
        timeout: 5000,
      });
      releaseCalendar(true);
      const responses = await Promise.all([firstRetry, secondRetry]);

      expect(responses.map((response) => response.status).toSorted()).toEqual([200, 409]);
      expect(calendarCreateCallCount).toBe(1);
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/vc/"))).toBe(false);
    } finally {
      process.env.FEISHU_APP_ID2 = originalSecondaryAppId;
    }
  });

  it("safely retries a stale calendar-only creating state", async () => {
    const originalSecondaryAppId = process.env.FEISHU_APP_ID2;
    process.env.FEISHU_APP_ID2 = "cli_test_feishu_secondary_stale_creation";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 99_991_663, msg: "temporary token failure" }), {
        headers: { "content-type": "application/json" },
        status: 400,
      }),
    );

    try {
      const app = makeApp("feishu");
      const createResponse = await app.request("/human-interview-meetings", {
        body: JSON.stringify({
          interviewerIds: [INTERVIEWER_ID],
          roundIds: [ROUND_ID],
          scheduledAt: "2026-08-05T09:30:00.000Z",
          title: "张三 - 真人复面",
          validUntil: "2026-08-06T09:30:00.000Z",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      expect(createResponse.status).toBe(502);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      const { meetingId } = (await createResponse.json()) as { meetingId: string };
      await db
        .update(studioHumanInterviewMeeting)
        .set({
          feishuSyncStatus: "creating",
          updatedAt: new Date("2026-08-05T08:00:00.000Z"),
        })
        .where(eq(studioHumanInterviewMeeting.id, meetingId));

      fetchMock
        .mockReset()
        .mockResolvedValueOnce(
          Response.json({
            code: 0,
            expire: 7200,
            msg: "success",
            tenant_access_token: "stale-creation-token",
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            code: 0,
            data: { calendars: [{ calendar: { calendar_id: "calendar_stale_retry" } }] },
            msg: "success",
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            code: 0,
            data: {
              event: {
                app_link: "https://applink.feishu.cn/event/stale-retry",
                event_id: "event_stale_retry",
              },
            },
            msg: "success",
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            code: 0,
            data: { attendees: [{ user_id: "ou_interviewer_secondary" }] },
            msg: "success",
          }),
        );
      const retryResponse = await app.request(
        `/human-interview-meetings/${meetingId}/feishu-sync`,
        { method: "POST" },
      );

      expect(retryResponse.status).toBe(200);
      expect(await retryResponse.json()).toMatchObject({
        feishu: { status: "ready" },
        id: meetingId,
      });
      const [persisted] = await db
        .select({ status: studioHumanInterviewMeeting.feishuSyncStatus })
        .from(studioHumanInterviewMeeting)
        .where(eq(studioHumanInterviewMeeting.id, meetingId));
      expect(persisted?.status).toBe("ready");
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes("/vc/v1/reserves/apply")),
      ).toBe(false);
    } finally {
      process.env.FEISHU_APP_ID2 = originalSecondaryAppId;
    }
  });

  it("defaults an interviewer without a Feishu binding to the second app", async () => {
    process.env.FEISHU_APP_ID2 = "cli_test_feishu_secondary_unlinked_interviewer";
    await db.delete(account).where(eq(account.id, "test_feishu_meeting_account_interviewer"));
    await db
      .delete(account)
      .where(eq(account.id, "test_feishu_meeting_account_interviewer_secondary"));
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("tenant_access_token/internal")) {
        return new Response(
          JSON.stringify({
            code: 0,
            expire: 7200,
            msg: "success",
            tenant_access_token: "fallback-token",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        );
      }
      if (url.includes("contact/v3/users/batch_get_id")) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              user_list: [
                {
                  email: "interviewer-feishu-meeting@example.com",
                  user_id: "ou_interviewer_fallback",
                },
              ],
            },
            msg: "success",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        );
      }
      if (url.includes("/calendars/primary")) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              calendars: [{ calendar: { calendar_id: "calendar_fallback", role: "owner" } }],
            },
            msg: "success",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        );
      }
      if (url.includes("/attendees")) {
        // SAFETY: This test constructs the value with the asserted contract before this boundary.
        const requestBody = JSON.parse(String(init?.body)) as {
          attendees: { user_id: string }[];
        };
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              attendees: requestBody.attendees,
            },
            msg: "success",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            event: {
              app_link: "https://applink.feishu.cn/event/fallback",
              event_id: "event_fallback",
            },
          },
          msg: "success",
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      );
    });

    const response = await makeApp("feishu").request("/human-interview-meetings", {
      body: JSON.stringify({
        interviewerIds: [INTERVIEWER_ID],
        notes: null,
        roundIds: [ROUND_ID],
        scheduledAt: "2026-08-05T09:30:00.000Z",
        title: "张三 - 真人复面",
        validUntil: "2026-08-06T09:30:00.000Z",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const body = (await response.json()) as { feishu?: { providerId?: string } };
    expect(body.feishu?.providerId).toBe("feishu-jiguang-hr");
  });
});
