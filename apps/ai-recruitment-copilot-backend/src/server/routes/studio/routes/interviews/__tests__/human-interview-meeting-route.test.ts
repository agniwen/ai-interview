/* oxlint-disable max-lines, prefer-response-static-json, require-await -- end-to-end route scenarios keep sequential Feishu checkpoints readable. */

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import {
  account,
  member,
  organization,
  studioHumanInterviewMeeting,
  studioHumanInterviewRound,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import {
  FeishuReserveResultUnknownError,
  recordFeishuHumanInterviewSyncFailure,
} from "../utils/feishu-human-interview-meeting";

vi.mock("@arc/ai-recruitment-copilot-backend/server/middlewares/permission", () => ({
  requirePermission: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

// oxlint-disable-next-line import/first -- route import must follow the hoisted permission mock.
import { studioInterviewCollectionRouter } from "../collection-route";

const INTERVIEWER_ID = "test_feishu_meeting_interviewer";
const INTERVIEW_ID = "test_feishu_meeting_candidate";
const NOW = new Date("2026-08-05T09:00:00.000Z");
const OPERATOR_ID = "test_feishu_meeting_operator";
const ORG_ID = "test_feishu_meeting_org";
const OUTSIDER_ID = "test_feishu_meeting_outsider";
const PRIMARY_INTERVIEWER_ID = "test_feishu_meeting_primary_interviewer";
const ROUND_ID = "test_feishu_meeting_round";
const SECONDARY_INTERVIEWER_ID = "test_feishu_meeting_secondary_interviewer";

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
      providerId: "feishu",
      updatedAt: NOW,
      userId: OPERATOR_ID,
    },
    {
      accountId: "ou_interviewer_primary",
      createdAt: NOW,
      id: "test_feishu_meeting_account_interviewer",
      providerId: "feishu",
      updatedAt: NOW,
      userId: INTERVIEWER_ID,
    },
    {
      accountId: "ou_operator_secondary",
      createdAt: NOW,
      id: "test_feishu_meeting_account_operator_secondary",
      providerId: "feishu-jiguang-hr",
      updatedAt: NOW,
      userId: OPERATOR_ID,
    },
    {
      accountId: "ou_interviewer_secondary",
      createdAt: NOW,
      id: "test_feishu_meeting_account_interviewer_secondary",
      providerId: "feishu-jiguang-hr",
      updatedAt: NOW,
      userId: INTERVIEWER_ID,
    },
    {
      accountId: "ou_primary_interviewer",
      createdAt: NOW,
      id: "test_feishu_meeting_account_primary_interviewer",
      providerId: "feishu",
      updatedAt: NOW,
      userId: PRIMARY_INTERVIEWER_ID,
    },
    {
      accountId: "ou_secondary_interviewer",
      createdAt: NOW,
      id: "test_feishu_meeting_account_secondary_interviewer",
      providerId: "feishu-jiguang-hr",
      updatedAt: NOW,
      userId: SECONDARY_INTERVIEWER_ID,
    },
  ]);
  await db.insert(studioInterview).values({
    candidateName: "张三",
    createdAt: NOW,
    createdBy: OPERATOR_ID,
    id: INTERVIEW_ID,
    organizationId: ORG_ID,
    updatedAt: NOW,
  });
  await db.insert(studioHumanInterviewRound).values({
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
  });
});

afterAll(cleanup);

beforeEach(async () => {
  vi.restoreAllMocks();
  process.env.FEISHU_APP_ID = "cli_test_feishu_primary";
  process.env.FEISHU_APP_ID2 = "cli_test_feishu_secondary";
  await db
    .delete(studioHumanInterviewMeeting)
    .where(eq(studioHumanInterviewMeeting.organizationId, ORG_ID));
});

describe("POST /human-interview-meetings", () => {
  it("uses the interviewers' common app and only adds interviewers to Feishu", async () => {
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
              reserve: {
                app_link: "https://applink.feishu.cn/client/video/123456789",
                id: "reserve_route_1",
                meeting_no: "123456789",
                url: "https://vc.feishu.cn/j/123456789",
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
    expect(fetchMock).toHaveBeenCalled();
    const tenantTokenRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("tenant_access_token/internal"),
    );
    expect(JSON.parse(String(tenantTokenRequest?.[1]?.body))).toEqual({
      app_id: "cli_test_feishu_secondary",
      app_secret: "secondary-secret",
    });
    const reserveRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/vc/v1/reserves/apply"),
    );
    expect(JSON.parse(String(reserveRequest?.[1]?.body))).toMatchObject({
      meeting_settings: {
        assign_host_list: [{ id: "ou_interviewer_secondary", user_type: 1 }],
      },
      owner_id: "ou_interviewer_secondary",
    });
    const attendeeRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/attendees"),
    );
    expect(JSON.parse(String(attendeeRequest?.[1]?.body))).toEqual({
      attendees: [{ type: "user", user_id: "ou_interviewer_secondary" }],
      need_notification: true,
    });
    const body = (await response.json()) as {
      feishu?: { meetingUrl?: string; providerId?: string; status?: string };
    };
    expect(body.feishu?.providerId).toBe("feishu-jiguang-hr");
    expect(body.feishu?.status).toBe("ready");
    expect(body.feishu?.meetingUrl).toBe("https://vc.feishu.cn/j/123456789");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("rejects interviewers without a common Feishu app before calling Feishu", async () => {
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

  it("returns a retryable failed state when calendar creation fails after the reserve", async () => {
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
              reserve: {
                app_link: "https://applink.feishu.cn/client/video/987654321",
                id: "reserve_route_failed_calendar",
                meeting_no: "987654321",
                url: "https://vc.feishu.cn/j/987654321",
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
    const retryBody = (await retryResponse.json()) as {
      feishu?: { meetingUrl?: string; status?: string };
    };
    expect(retryBody.feishu).toMatchObject({
      meetingUrl: "https://vc.feishu.cn/j/987654321",
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
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/vc/v1/reserves"))).toBe(
      false,
    );
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

  it("rejects a non-member interviewer before calling Feishu", async () => {
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

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "存在不属于当前工作区的真人面试官。" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checkpoints partially added attendees and retries only the missing person", async () => {
    const originalSecondaryAppId = process.env.FEISHU_APP_ID2;
    process.env.FEISHU_APP_ID2 = "cli_test_feishu_secondary_partial_attendees";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
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
      if (url.includes("/vc/v1/reserves/apply")) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          meeting_settings: {
            assign_host_list: [
              { id: "ou_interviewer_secondary", user_type: 1 },
              { id: "ou_secondary_interviewer", user_type: 1 },
            ],
          },
          owner_id: "ou_interviewer_secondary",
        });
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              reserve: {
                app_link: "https://applink.feishu.cn/client/video/partial",
                id: "reserve_partial_attendees",
                meeting_no: "333444555",
                url: "https://vc.feishu.cn/j/333444555",
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
      const failureBody = (await response.json()) as { meetingId: string };
      const [persisted] = await db
        .select({ attendeeOpenIds: studioHumanInterviewMeeting.feishuAttendeeOpenIds })
        .from(studioHumanInterviewMeeting)
        .where(eq(studioHumanInterviewMeeting.id, failureBody.meetingId));
      expect(persisted?.attendeeOpenIds).toEqual(["ou_interviewer_secondary"]);

      fetchMock.mockReset().mockImplementation(async (_input, init) => {
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
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      process.env.FEISHU_APP_ID2 = originalSecondaryAppId;
    }
  });

  it("marks an interrupted reserve request as unknown and blocks blind retry", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("connection reset"));

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
    const failureBody = (await response.json()) as {
      feishuStatus: string;
      meetingId: string;
    };
    expect(failureBody).toMatchObject({
      feishuStatus: "unknown",
      meetingId: expect.any(String),
    });

    fetchMock.mockReset();
    const retryResponse = await makeApp("feishu").request(
      `/human-interview-meetings/${failureBody.meetingId}/feishu-sync`,
      { method: "POST" },
    );

    expect(retryResponse.status).toBe(409);
    expect(await retryResponse.json()).toMatchObject({
      feishuStatus: "unknown",
      meetingId: failureBody.meetingId,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checkpoints a created reserve when Feishu reports an invalid host", async () => {
    const originalSecondaryAppId = process.env.FEISHU_APP_ID2;
    process.env.FEISHU_APP_ID2 = "cli_test_feishu_secondary_invalid_host";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("tenant_access_token/internal")) {
        return new Response(
          JSON.stringify({
            code: 0,
            expire: 7200,
            msg: "success",
            tenant_access_token: "invalid-host-token",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            reserve: {
              app_link: "https://applink.feishu.cn/client/video/invalid-host",
              id: "reserve_invalid_host",
              meeting_no: "444555666",
              url: "https://vc.feishu.cn/j/444555666",
            },
            reserve_correction_check_info: {
              invalid_host_id_list: ["ou_interviewer_secondary"],
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
          interviewerIds: [INTERVIEWER_ID],
          roundIds: [ROUND_ID],
          scheduledAt: "2026-08-05T09:30:00.000Z",
          title: "张三 - 真人复面",
          validUntil: "2026-08-06T09:30:00.000Z",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      expect(response.status).toBe(502);
      const failureBody = (await response.json()) as {
        feishuStatus: string;
        meetingId: string;
      };
      expect(failureBody.feishuStatus).toBe("unknown");
      const [persisted] = await db
        .select({
          meetingUrl: studioHumanInterviewMeeting.feishuMeetingUrl,
          reserveId: studioHumanInterviewMeeting.feishuReserveId,
          status: studioHumanInterviewMeeting.feishuSyncStatus,
        })
        .from(studioHumanInterviewMeeting)
        .where(eq(studioHumanInterviewMeeting.id, failureBody.meetingId));
      expect(persisted).toEqual({
        meetingUrl: "https://vc.feishu.cn/j/444555666",
        reserveId: "reserve_invalid_host",
        status: "unknown",
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      process.env.FEISHU_APP_ID2 = originalSecondaryAppId;
    }
  });

  it("makes a recovered reserve checkpoint retryable after the fallback write succeeds", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 99_991_663, msg: "temporary token failure" }), {
        headers: { "content-type": "application/json" },
        status: 400,
      }),
    );
    const response = await makeApp("feishu").request("/human-interview-meetings", {
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
    expect(response.status).toBe(502);
    const { meetingId } = (await response.json()) as { meetingId: string };

    const recovered = await recordFeishuHumanInterviewSyncFailure({
      error: new FeishuReserveResultUnknownError(
        "飞书会议已创建，但首次检查点保存失败。",
        {
          appLink: "https://applink.feishu.cn/client/video/recovered",
          meetingNo: "666777888",
          meetingUrl: "https://vc.feishu.cn/j/666777888",
          reserveId: "reserve_recovered_checkpoint",
        },
        { canResumeAfterCheckpoint: true },
      ),
      meetingId,
      organizationId: ORG_ID,
    });

    expect(recovered.status).toBe("failed");
    const [persisted] = await db
      .select({
        meetingUrl: studioHumanInterviewMeeting.feishuMeetingUrl,
        reserveId: studioHumanInterviewMeeting.feishuReserveId,
        status: studioHumanInterviewMeeting.feishuSyncStatus,
      })
      .from(studioHumanInterviewMeeting)
      .where(eq(studioHumanInterviewMeeting.id, meetingId));
    expect(persisted).toEqual({
      meetingUrl: "https://vc.feishu.cn/j/666777888",
      reserveId: "reserve_recovered_checkpoint",
      status: "failed",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("allows only one concurrent retry to create a Feishu reserve", async () => {
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
      return new Response(JSON.stringify({ code: 12_345, msg: "temporary reserve failure" }), {
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
      const { meetingId } = (await createResponse.json()) as { meetingId: string };

      const { promise: reserveGate, resolve: releaseReserve } = Promise.withResolvers<true>();
      let reserveCallCount = 0;
      fetchMock.mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/vc/v1/reserves/apply")) {
          reserveCallCount += 1;
          await reserveGate;
          return new Response(
            JSON.stringify({
              code: 0,
              data: {
                reserve: {
                  app_link: "https://applink.feishu.cn/client/video/concurrent",
                  id: "reserve_concurrent_retry",
                  meeting_no: "555666777",
                  url: "https://vc.feishu.cn/j/555666777",
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
      });

      const retryPath = `/human-interview-meetings/${meetingId}/feishu-sync`;
      const firstRetry = app.request(retryPath, { method: "POST" });
      const secondRetry = app.request(retryPath, { method: "POST" });
      await vi.waitFor(() => expect(reserveCallCount).toBeGreaterThanOrEqual(1));
      releaseReserve(true);
      const responses = await Promise.all([firstRetry, secondRetry]);

      expect(responses.map((response) => response.status).toSorted()).toEqual([200, 409]);
      expect(reserveCallCount).toBe(1);
    } finally {
      process.env.FEISHU_APP_ID2 = originalSecondaryAppId;
    }
  });

  it("marks a stale creating state without a reserve checkpoint as unknown", async () => {
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
      const { meetingId } = (await createResponse.json()) as { meetingId: string };
      await db
        .update(studioHumanInterviewMeeting)
        .set({
          feishuSyncStatus: "creating",
          updatedAt: new Date("2026-08-05T08:00:00.000Z"),
        })
        .where(eq(studioHumanInterviewMeeting.id, meetingId));

      fetchMock.mockReset().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            expire: 7200,
            msg: "success",
            tenant_access_token: "stale-creation-token",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      );
      const retryResponse = await app.request(
        `/human-interview-meetings/${meetingId}/feishu-sync`,
        { method: "POST" },
      );

      expect(retryResponse.status).toBe(409);
      expect(await retryResponse.json()).toMatchObject({
        feishuStatus: "unknown",
        meetingId,
      });
      const [persisted] = await db
        .select({ status: studioHumanInterviewMeeting.feishuSyncStatus })
        .from(studioHumanInterviewMeeting)
        .where(eq(studioHumanInterviewMeeting.id, meetingId));
      expect(persisted?.status).toBe("unknown");
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
      if (url.includes("/vc/v1/reserves/apply")) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              reserve: {
                app_link: "https://applink.feishu.cn/client/video/fallback",
                id: "reserve_fallback",
                meeting_no: "111222333",
                url: "https://vc.feishu.cn/j/111222333",
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
            data: {
              calendars: [{ calendar: { calendar_id: "calendar_fallback", role: "owner" } }],
            },
            msg: "success",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        );
      }
      if (url.includes("/attendees")) {
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
    const body = (await response.json()) as { feishu?: { providerId?: string } };
    expect(body.feishu?.providerId).toBe("feishu-jiguang-hr");
  });
});
