/* oxlint-disable prefer-response-static-json -- explicit response bodies mirror Feishu HTTP fixtures. */

import { describe, expect, it, vi } from "vitest";
import {
  createFeishuHumanInterviewClient,
  FeishuReserveResultUnknownError,
} from "./feishu-human-interview-meeting";

describe("Feishu human interview HTTP contract", () => {
  it("creates a reserve owned by the operator with interviewers as hosts", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            reserve: {
              app_link: "https://applink.feishu.cn/client/video/123456789",
              id: "reserve_1",
              meeting_no: "123456789",
              url: "https://vc.feishu.cn/j/123456789",
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

    const reserve = await client.createReserve({
      endAt: new Date("2026-08-05T10:30:00.000Z"),
      hostOpenIds: ["ou_interviewer_1", "ou_interviewer_2"],
      ownerOpenId: "ou_operator",
      title: "张三 - 真人复面",
    });

    expect(reserve).toEqual({
      appLink: "https://applink.feishu.cn/client/video/123456789",
      meetingNo: "123456789",
      meetingUrl: "https://vc.feishu.cn/j/123456789",
      reserveId: "reserve_1",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://open.feishu.cn/open-apis/vc/v1/reserves/apply?user_id_type=open_id");
    expect(init).toMatchObject({
      headers: {
        authorization: "Bearer tenant-token",
        "content-type": "application/json; charset=utf-8",
      },
      method: "POST",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      end_time: "1785925800",
      meeting_settings: {
        assign_host_list: [
          { id: "ou_interviewer_1", user_type: 1 },
          { id: "ou_interviewer_2", user_type: 1 },
        ],
        auto_record: false,
        topic: "张三 - 真人复面",
      },
      owner_id: "ou_operator",
    });
  });

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

  it("creates a calendar event that reuses the existing Feishu meeting", async () => {
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
      description: "候选人：张三",
      endAt: new Date("2026-08-05T10:30:00.000Z"),
      idempotencyKey: "human-interview-meeting-000000000001",
      meetingUrl: "https://vc.feishu.cn/j/123456789",
      startAt: new Date("2026-08-05T09:30:00.000Z"),
      title: "张三 - 真人复面",
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
      description: "候选人：张三",
      end_time: { timestamp: "1785925800", timezone: "Asia/Shanghai" },
      free_busy_status: "busy",
      start_time: { timestamp: "1785922200", timezone: "Asia/Shanghai" },
      summary: "张三 - 真人复面",
      vchat: {
        description: "加入飞书会议",
        icon_type: "vc",
        meeting_url: "https://vc.feishu.cn/j/123456789",
        vc_type: "third_party",
      },
    });
  });

  it("adds the operator and interviewers as unique notified attendees", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            attendees: [
              { attendee_id: "attendee_1", type: "user", user_id: "ou_operator" },
              { attendee_id: "attendee_2", type: "user", user_id: "ou_interviewer" },
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
        attendeeOpenIds: ["ou_operator", "ou_interviewer", "ou_operator"],
        calendarId: "feishu.cn_bot@group.calendar.feishu.cn",
        eventId: "event_1",
      }),
    ).resolves.toEqual(["ou_operator", "ou_interviewer"]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://open.feishu.cn/open-apis/calendar/v4/calendars/feishu.cn_bot%40group.calendar.feishu.cn/events/event_1/attendees?user_id_type=open_id",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      attendees: [
        { type: "user", user_id: "ou_operator" },
        { type: "user", user_id: "ou_interviewer" },
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

  it("marks an interrupted reserve request as result unknown", async () => {
    const client = createFeishuHumanInterviewClient({
      accessToken: "tenant-token",
      fetch: vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed")),
    });

    await expect(
      client.createReserve({
        endAt: new Date("2026-08-05T10:30:00.000Z"),
        hostOpenIds: ["ou_interviewer"],
        ownerOpenId: "ou_operator",
        title: "张三 - 真人复面",
      }),
    ).rejects.toBeInstanceOf(FeishuReserveResultUnknownError);
  });

  it("marks an unreadable successful reserve response as result unknown", async () => {
    const client = createFeishuHumanInterviewClient({
      accessToken: "tenant-token",
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("truncated-json", { status: 200 })),
    });

    await expect(
      client.createReserve({
        endAt: new Date("2026-08-05T10:30:00.000Z"),
        hostOpenIds: ["ou_interviewer"],
        ownerOpenId: "ou_operator",
        title: "张三 - 真人复面",
      }),
    ).rejects.toBeInstanceOf(FeishuReserveResultUnknownError);
  });

  it("rejects a corrected reserve when a selected host is invalid", async () => {
    const client = createFeishuHumanInterviewClient({
      accessToken: "tenant-token",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          code: 0,
          data: {
            reserve: {
              app_link: "https://applink.feishu.cn/client/video/123456789",
              id: "reserve_invalid_host",
              meeting_no: "123456789",
              url: "https://vc.feishu.cn/j/123456789",
            },
            reserve_correction_check_info: {
              invalid_host_id_list: ["ou_invalid_host"],
            },
          },
          msg: "success",
        }),
      ),
    });

    await expect(
      client.createReserve({
        endAt: new Date("2026-08-05T10:30:00.000Z"),
        hostOpenIds: ["ou_invalid_host"],
        ownerOpenId: "ou_operator",
        title: "张三 - 真人复面",
      }),
    ).rejects.toThrow("以下面试官无法设置为飞书会议主持人：ou_invalid_host");
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
