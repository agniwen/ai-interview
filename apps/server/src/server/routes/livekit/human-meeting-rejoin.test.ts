/* oxlint-disable anti-slop/no-module-mocking -- Keep webhook, lifecycle transitions and public admission real; isolate persistence, invite resolution and external media services. */
import type { humanInterviewMeeting } from "@app/db-schema/schema";
import type * as livekitSdk from "livekit-server-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "../../factory";
import type * as notificationEvents from "../../interview-notifications/utils/events";
import { publicRouter } from "../public/route";
import type * as meetings from "../studio/routes/interviews/dao/human-interview-meetings";
import type * as humanLivekit from "../studio/routes/interviews/utils/human-interview-livekit";
import { forceEndHumanInterviewMeeting } from "../studio/routes/interviews/dao/human-interview-meeting-lifecycle";
import { reconcileExpiredHumanInterviewMeetings } from "../studio/routes/interviews/application/reconcile-expired-human-interview-meetings";
import { livekitRouter } from "./route";

type Meeting = Pick<
  typeof humanInterviewMeeting.$inferSelect,
  | "id"
  | "organizationId"
  | "status"
  | "validUntil"
  | "liveKitRoomName"
  | "startedAt"
  | "endedAt"
  | "lifecycleSource"
  | "lifecycleOccurredAt"
  | "establishedAt"
>;

const mocks = vi.hoisted(() => {
  const meeting: Meeting = {
    endedAt: null,
    establishedAt: null,
    id: "rejoin-meeting",
    lifecycleOccurredAt: null,
    lifecycleSource: null,
    liveKitRoomName: "human_rejoin",
    organizationId: "test-org",
    startedAt: null,
    status: "scheduled",
    validUntil: new Date("2026-09-23T11:10:00Z"),
  };
  const select = () => {
    const rows = Promise.resolve([meeting]);
    const query = Object.assign(rows, {
      for() {
        return query;
      },
      from() {
        return query;
      },
      limit() {
        return query;
      },
      orderBy() {
        return query;
      },
      where() {
        return query;
      },
    });
    return query;
  };
  const store = {
    select,
    update: () => ({
      set: (patch: Partial<Meeting>) => ({
        where: () => {
          Object.assign(meeting, patch);
          return Promise.resolve();
        },
      }),
    }),
  };
  return {
    cancelReminders: vi.fn(),
    db: { ...store, transaction: <T>(fn: (tx: typeof store) => Promise<T>) => fn(store) },
    meeting,
    rooms: vi.fn(),
    sign: vi.fn(),
    stopRecording: vi.fn(),
  };
});

vi.mock("../../../lib/server/db/index", () => ({ db: mocks.db }));
vi.mock("../../interview-notifications/utils/events", async (importOriginal) => ({
  ...(await importOriginal<typeof notificationEvents>()),
  cancelPendingHumanMeetingReminders: mocks.cancelReminders,
}));
vi.mock("livekit-server-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof livekitSdk>()),
  WebhookReceiver: class {
    receive = vi.fn((body: string) => Promise.resolve(JSON.parse(body)));
  },
}));
vi.mock("../studio/routes/interviews/utils/human-interview-recording-service", () => ({
  stopActiveHumanInterviewRecordingByRoomName: mocks.stopRecording,
}));
vi.mock("../studio/routes/interviews/utils/human-interview-livekit", async (importOriginal) => ({
  ...(await importOriginal<typeof humanLivekit>()),
  listHumanInterviewLiveKitRooms: mocks.rooms,
  signHumanInterviewMeetingToken: mocks.sign,
}));
vi.mock("../studio/routes/interviews/dao/human-interview-meetings", async (importOriginal) => {
  const actual = await importOriginal<typeof meetings>();
  const resolveScope = () =>
    Promise.resolve({
      ...mocks.meeting,
      candidateInviteStatus: "accepted",
      role: "interviewer",
      scheduledAt: "2026-09-23T10:10:00Z",
      validUntil: mocks.meeting.validUntil?.toISOString() ?? null,
    });
  return {
    ...actual,
    resolveHumanInterviewMeetingInterviewerInviteToken: resolveScope,
    resolveHumanInterviewMeetingInviteToken: resolveScope,
  };
});

const app = factory.createApp().route("/livekit", livekitRouter).route("/public", publicRouter);
const candidatePath = "/public/human-interview-meetings/test-invite/livekit-token";
const interviewerPath = "/public/human-interview-meetings/interviewer/test-invite/livekit-token";

async function webhook(event: "room_started" | "room_finished") {
  const response = await app.request("/livekit/webhook", {
    body: JSON.stringify({ event, room: { name: "human_rejoin" } }),
    method: "POST",
  });
  expect(response.status).toBe(200);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-23T10:02:00Z"));
  vi.stubEnv("LIVEKIT_API_KEY", "test-only");
  vi.stubEnv("LIVEKIT_API_SECRET", "test-only");
  Object.assign(mocks.meeting, {
    endedAt: null,
    establishedAt: null,
    lifecycleOccurredAt: null,
    lifecycleSource: null,
    startedAt: null,
    status: "scheduled",
    validUntil: new Date("2026-09-23T11:10:00Z"),
  });
  mocks.sign.mockResolvedValue({ participantToken: "test-only-token" });
  mocks.rooms.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("真人面试视频房间关闭后重进", () => {
  it("ends an established empty meeting at expiry without another room-close callback", async () => {
    await webhook("room_started");
    mocks.meeting.establishedAt = new Date();
    await webhook("room_finished");
    expect(mocks.meeting.status).toBe("in_progress");
    vi.setSystemTime(new Date("2026-09-23T11:10:01Z"));
    await reconcileExpiredHumanInterviewMeetings();
    expect(mocks.meeting.status).toBe("ended");
    expect(mocks.meeting.endedAt).not.toBeNull();
    const response = await app.request(candidatePath, { method: "POST" });
    expect(response.status).toBe(403);
  });

  it("does not end a room that still exists after the admission deadline", async () => {
    await webhook("room_started");
    mocks.meeting.establishedAt = new Date();
    vi.setSystemTime(new Date("2026-09-23T11:10:01Z"));
    mocks.rooms.mockResolvedValue([{ name: mocks.meeting.liveKitRoomName }]);
    await reconcileExpiredHumanInterviewMeetings();
    expect(mocks.meeting.status).toBe("in_progress");
    expect(mocks.cancelReminders).not.toHaveBeenCalled();
  });

  it("does not treat an unavailable room service as an empty room", async () => {
    await webhook("room_started");
    mocks.rooms.mockRejectedValueOnce(new Error("LiveKit unavailable"));
    await expect(reconcileExpiredHumanInterviewMeetings()).rejects.toThrow("LiveKit unavailable");
    expect(mocks.meeting.status).toBe("in_progress");
  });

  it("rechecks an extended deadline after looking up the room", async () => {
    await webhook("room_started");
    mocks.meeting.establishedAt = new Date();
    vi.setSystemTime(new Date("2026-09-23T11:10:01Z"));
    mocks.rooms.mockImplementationOnce(() => {
      mocks.meeting.validUntil = new Date("2026-09-23T12:10:00Z");
      return Promise.resolve([]);
    });
    await reconcileExpiredHumanInterviewMeetings();
    expect(mocks.meeting.status).toBe("in_progress");
    expect(mocks.cancelReminders).not.toHaveBeenCalled();
  });
  it("allows an early candidate to rejoin repeatedly before expiry without ending the interview", async () => {
    const initialJoin = await app.request(candidatePath, { method: "POST" });
    expect(initialJoin.status).toBe(200);
    await webhook("room_started");
    const { startedAt } = mocks.meeting;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await webhook("room_finished");
      expect(mocks.meeting.status).toBe("in_progress");
      expect(mocks.meeting.endedAt).toBeNull();
      const candidateJoin = await app.request(candidatePath, { method: "POST" });
      const interviewerJoin = await app.request(interviewerPath, { method: "POST" });
      expect(candidateJoin.status).toBe(200);
      expect(interviewerJoin.status).toBe(200);
      await webhook("room_started");
      expect(mocks.meeting.startedAt).toEqual(startedAt);
    }
    expect(mocks.stopRecording).toHaveBeenCalledTimes(2);
    expect(mocks.cancelReminders).not.toHaveBeenCalled();
  });

  it("still rejects reentry after an explicit end, including a later room callback", async () => {
    await webhook("room_started");
    await forceEndHumanInterviewMeeting({ meetingId: mocks.meeting.id });
    await webhook("room_finished");
    expect(mocks.meeting.lifecycleSource).toBe("manual");
    const response = await app.request(candidatePath, { method: "POST" });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "该真人复面会议已结束或取消。" });
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("does not reopen a cancelled meeting", async () => {
    mocks.meeting.status = "cancelled";
    await webhook("room_finished");
    expect(mocks.meeting.status).toBe("cancelled");
    const response = await app.request(candidatePath, { method: "POST" });
    expect(response.status).toBe(403);
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it.each(["2026-09-23T11:10:00Z", "2026-09-23T11:10:01Z"])(
    "rejects reentry at %s even when the room-close callback has not arrived",
    async (now) => {
      await webhook("room_started");
      vi.setSystemTime(new Date(now));
      const response = await app.request(candidatePath, { method: "POST" });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "该真人复面会议已超过有效时间。" });
      await webhook("room_finished");
      expect(mocks.meeting.status).toBe("ended");
      expect(mocks.sign).not.toHaveBeenCalled();
    },
  );
});
