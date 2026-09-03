/* oxlint-disable prefer-response-static-json -- explicit response bodies mirror Feishu HTTP fixtures. */

import { describe, expect, it, vi } from "vitest";
import {
  buildCalendarDescription,
  createFeishuHumanInterviewClient,
} from "./feishu-human-interview-meeting";

describe("Feishu interview calendar description", () => {
  it("includes the bound jobs and keeps candidates, rounds and notes", () => {
    const description = buildCalendarDescription({
      candidates: [
        { candidateName: "张三", jobDescriptionName: "前端技术经理", roundLabel: "业务一面" },
        { candidateName: "李四", jobDescriptionName: "前端技术经理", roundLabel: "CEO面试" },
      ],
      interviewers: [],
      meetingId: "meeting-1",
      notes: "请重点关注系统设计能力",
      validUntil: new Date("2026-09-04T03:00:00Z"),
    });
    expect(description).toContain("面试岗位：前端技术经理\n");
    expect(description).toContain("候选人：张三、李四");
    expect(description).toContain("面试轮次：业务一面、CEO面试");
    expect(description).toContain("备注：请重点关注系统设计能力");
  });

  it("does not invent a job for historical records without one", () => {
    expect(
      buildCalendarDescription({
        candidates: [{ candidateName: "张三", jobDescriptionName: null, roundLabel: "业务一面" }],
        interviewers: [],
        meetingId: "meeting-1",
        notes: null,
        validUntil: new Date("2026-09-04T03:00:00Z"),
      }),
    ).toContain("面试岗位：未关联岗位");
  });
});

describe("Feishu human interview HTTP contract", () => {
  it("loads the bot primary calendar", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
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
                user_id: "cli_bot",
              },
            ],
          },
          msg: "success",
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    );
    const client = createFeishuHumanInterviewClient({
      accessToken: "tenant-token",
      fetch: fetchMock,
    });

    await expect(client.getPrimaryCalendarId()).resolves.toBe(
      "feishu.cn_bot@group.calendar.feishu.cn",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://open.feishu.cn/open-apis/calendar/v4/calendars/primary?user_id_type=open_id",
      {
        headers: { authorization: "Bearer tenant-token" },
        method: "POST",
      },
    );
  });

  it("creates a calendar-only event without attaching a Feishu meeting", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            event: {
              app_link: "https://applink.feishu.cn/client/calendar/event/detail?key=event_1",
              event_id: "event_1",
            },
          },
          msg: "success",
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    );
    const client = createFeishuHumanInterviewClient({
      accessToken: "tenant-token",
      fetch: fetchMock,
    });

    const event = await client.createCalendarEvent({
      calendarId: "feishu.cn_bot@group.calendar.feishu.cn",
      description: "候选人：张三\n\n面试岗位：前端工程师",
      endAt: new Date("2026-08-05T10:30:00.000Z"),
      idempotencyKey: "human-interview-meeting-000000000001",
      startAt: new Date("2026-08-05T09:30:00.000Z"),
      title: "张三-前端工程师-业务一面",
    });

    expect(event).toEqual({
      calendarEventUrl: "https://applink.feishu.cn/client/calendar/event/detail?key=event_1",
      eventId: "event_1",
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://open.feishu.cn/open-apis/calendar/v4/calendars/feishu.cn_bot%40group.calendar.feishu.cn/events?idempotency_key=human-interview-meeting-000000000001&user_id_type=open_id",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      description: "候选人：张三\n\n面试岗位：前端工程师",
      end_time: { timestamp: "1785925800", timezone: "Asia/Shanghai" },
      free_busy_status: "busy",
      start_time: { timestamp: "1785922200", timezone: "Asia/Shanghai" },
      summary: "张三-前端工程师-业务一面",
    });
  });

  it("updates the existing calendar event time and notifies attendees", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ code: 0, data: {}, msg: "success" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    const client = createFeishuHumanInterviewClient({
      accessToken: "tenant-token",
      fetch: fetchMock,
    });

    await client.updateCalendarEventTime({
      calendarId: "feishu.cn_bot@group.calendar.feishu.cn",
      description: "真人复面安排\n\n在线面试入口：https://interview.example.test/interview",
      endAt: new Date("2026-08-05T11:30:00.000Z"),
      eventId: "event_1",
      startAt: new Date("2026-08-05T10:30:00.000Z"),
      title: "张三-前端工程师-业务一面",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://open.feishu.cn/open-apis/calendar/v4/calendars/feishu.cn_bot%40group.calendar.feishu.cn/events/event_1?user_id_type=open_id",
      {
        body: JSON.stringify({
          description: "真人复面安排\n\n在线面试入口：https://interview.example.test/interview",
          end_time: { timestamp: "1785929400", timezone: "Asia/Shanghai" },
          need_notification: true,
          start_time: { timestamp: "1785925800", timezone: "Asia/Shanghai" },
          summary: "张三-前端工程师-业务一面",
        }),
        headers: {
          authorization: "Bearer tenant-token",
          "content-type": "application/json; charset=utf-8",
        },
        method: "PATCH",
      },
    );
  });

  it("adds selected interviewers as unique notified attendees", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            attendees: [
              { attendee_id: "attendee_1", type: "user", user_id: "ou_interviewer_1" },
              { attendee_id: "attendee_2", type: "user", user_id: "ou_interviewer_2" },
            ],
          },
          msg: "success",
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    );
    const client = createFeishuHumanInterviewClient({
      accessToken: "tenant-token",
      fetch: fetchMock,
    });

    await expect(
      client.addCalendarAttendees({
        attendeeOpenIds: ["ou_interviewer_1", "ou_interviewer_2", "ou_interviewer_1"],
        calendarId: "feishu.cn_bot@group.calendar.feishu.cn",
        eventId: "event_1",
      }),
    ).resolves.toEqual(["ou_interviewer_1", "ou_interviewer_2"]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://open.feishu.cn/open-apis/calendar/v4/calendars/feishu.cn_bot%40group.calendar.feishu.cn/events/event_1/attendees?user_id_type=open_id",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      attendees: [
        { type: "user", user_id: "ou_interviewer_1" },
        { type: "user", user_id: "ou_interviewer_2" },
      ],
      need_notification: true,
    });
  });

  it("resolves app-scoped open ids from member emails", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            user_list: [
              { email: "operator@example.com", user_id: "ou_operator" },
              { email: "interviewer@example.com", user_id: "ou_interviewer" },
            ],
          },
          msg: "success",
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      ),
    );
    const client = createFeishuHumanInterviewClient({
      accessToken: "tenant-token",
      fetch: fetchMock,
    });

    await expect(
      client.resolveOpenIdsByEmail(["operator@example.com", "interviewer@example.com"]),
    ).resolves.toEqual(
      new Map([
        ["operator@example.com", "ou_operator"],
        ["interviewer@example.com", "ou_interviewer"],
      ]),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://open.feishu.cn/open-apis/contact/v3/users/batch_get_id?user_id_type=open_id",
      {
        body: JSON.stringify({
          emails: ["operator@example.com", "interviewer@example.com"],
          include_resigned: false,
        }),
        headers: {
          authorization: "Bearer tenant-token",
          "content-type": "application/json; charset=utf-8",
        },
        method: "POST",
      },
    );
  });

  it("rejects a partial attendee result", async () => {
    const client = createFeishuHumanInterviewClient({
      accessToken: "tenant-token",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 0,
            data: { attendees: [{ user_id: "ou_operator" }] },
            msg: "success",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      ),
    });

    const promise = client.addCalendarAttendees({
      attendeeOpenIds: ["ou_operator", "ou_interviewer"],
      calendarId: "calendar_1",
      eventId: "event_1",
    });
    await expect(promise).rejects.toMatchObject({
      addedOpenIds: ["ou_operator"],
      name: "FeishuPartialAttendeeError",
    });
  });
});
