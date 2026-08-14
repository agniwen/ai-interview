import { createLarkChannel } from "@larksuiteoapi/node-sdk";
import { describe, expect, it, vi } from "vitest";
import {
  createFeishuMeetingLifecycleEventHandlers,
  parseFeishuMeetingLifecycleEvent,
} from "../utils/meeting-lifecycle";

describe("parseFeishuMeetingLifecycleEvent", () => {
  it("maps a started event and accepts second-based timestamps", () => {
    const event = parseFeishuMeetingLifecycleEvent(
      {
        event_id: "event-started-1",
        meeting: { id: "meeting-1", meeting_no: "12345", start_time: "1786089600" },
      },
      "vc.meeting.meeting_started_v1",
    );

    expect(event).toMatchObject({
      eventId: "event-started-1",
      meetingId: "meeting-1",
      meetingNo: "12345",
      status: "in_progress",
    });
    expect(event.occurredAt.toISOString()).toBe("2026-08-07T08:00:00.000Z");
  });

  it("maps an ended event and reads v2 header ids", () => {
    const event = parseFeishuMeetingLifecycleEvent(
      {
        header: { create_time: "1786093200000", event_id: "event-ended-1" },
        meeting: { end_time: "1786093200000", id: "meeting-1" },
      },
      "vc.meeting.meeting_ended_v1",
    );

    expect(event).toMatchObject({
      eventId: "event-ended-1",
      meetingId: "meeting-1",
      status: "ended",
    });
    expect(event.occurredAt.toISOString()).toBe("2026-08-07T09:00:00.000Z");
  });
});

describe("createFeishuMeetingLifecycleEventHandlers", () => {
  it("registers exactly the two lifecycle event types on the existing channel dispatcher", () => {
    expect(Object.keys(createFeishuMeetingLifecycleEventHandlers("feishu"))).toEqual([
      "vc.meeting.meeting_ended_v1",
      "vc.meeting.meeting_started_v1",
    ]);
  });

  it("ignores lifecycle callbacks when human interview integration is disabled", async () => {
    vi.stubEnv("FEISHU_HUMAN_INTERVIEW_ENABLED", "false");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await createFeishuMeetingLifecycleEventHandlers("feishu")["vc.meeting.meeting_started_v1"](
        {},
      );

      expect(warning).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});

describe("LarkChannel event handlers", () => {
  it("registers application event handlers on the channel's existing dispatcher", async () => {
    const handler = vi.fn();
    const channel = createLarkChannel({
      appId: "cli_test",
      appSecret: "secret_test",
      eventHandlers: { "vc.meeting.meeting_started_v1": handler },
    });
    const internalChannel = channel as unknown as {
      dispatcher: { invoke: (data: unknown, options: { needCheck: boolean }) => Promise<void> };
      registerDispatcherHandlers: () => void;
    };

    internalChannel.registerDispatcherHandlers();
    await internalChannel.dispatcher.invoke(
      {
        event: { meeting: { id: "meeting-1" } },
        header: { event_type: "vc.meeting.meeting_started_v1" },
        schema: "2.0",
      },
      { needCheck: false },
    );

    expect(handler).toHaveBeenCalledOnce();
  });
});
