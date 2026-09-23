/* oxlint-disable anti-slop/no-module-mocking -- Exercise recording synchronization and its real claim/update code while isolating the database and external media services. */
import type { humanInterviewMeeting } from "@app/db-schema/schema";
import type * as recordingDao from "../../dao/human-interview-recording-tracks";
import { beforeEach, expect, it, vi } from "vitest";
import { synchronizeHumanInterviewTrackRecordings } from "../default-record-human-interview-tracks";
import { updateTrackRecording } from "../../dao/human-interview-recording-tracks";

type Meeting = Pick<
  typeof humanInterviewMeeting.$inferSelect,
  "id" | "organizationId" | "status" | "recordingTracks" | "recordingEgressId" | "recordingStatus"
>;

const mocks = vi.hoisted(() => {
  const meeting: Meeting = {
    id: "meeting",
    organizationId: "org",
    recordingEgressId: null,
    recordingStatus: "pending",
    recordingTracks: null,
    status: "in_progress",
  };
  const select = () => {
    const query = Object.assign(Promise.resolve([meeting]), {
      for() {
        return query;
      },
      from() {
        return query;
      },
      limit() {
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
    db: { ...store, transaction: <T>(fn: (tx: typeof store) => Promise<T>) => fn(store) },
    meeting,
    rooms: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
});

vi.mock("../../../../../../../lib/server/db/index", () => ({ db: mocks.db }));
vi.mock("../../dao/human-interview-recording-tracks", async (importOriginal) => ({
  ...(await importOriginal<typeof recordingDao>()),
  loadTrackRecordingScope: () =>
    Promise.resolve({
      meeting: mocks.meeting,
      participants: [
        { identity: "candidate_1", name: "候选人", role: "candidate" },
        { identity: "interviewer_1", name: "面试官", role: "interviewer" },
      ],
    }),
}));
vi.mock("../../utils/human-interview-livekit", () => ({
  listHumanInterviewLiveKitParticipants: () =>
    Promise.resolve([
      { identity: "candidate_1", tracks: [] },
      { identity: "interviewer_1", tracks: [] },
    ]),
  listHumanInterviewLiveKitRooms: mocks.rooms,
}));
vi.mock("@app/object-storage", () => ({
  buildHumanInterviewRecordingFileKey: () => Promise.resolve("recordings/room-audio.ogg"),
}));
vi.mock("../../utils/human-interview-recording", () => ({
  startHumanInterviewTrackRecording: mocks.start,
  stopHumanInterviewRoomRecording: mocks.stop,
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.meeting, {
    recordingEgressId: null,
    recordingStatus: "pending",
    recordingTracks: null,
    status: "in_progress",
  });
  mocks.rooms.mockResolvedValue([{ name: "human_meeting", sid: "RM_first" }]);
  mocks.start.mockImplementation(({ trackId }: { trackId: string }) =>
    Promise.resolve(`egress-${trackId}`),
  );
});

it("records a new segment for a recreated room and retains the completed segment", async () => {
  await synchronizeHumanInterviewTrackRecordings("human_meeting");
  const first = mocks.meeting.recordingTracks?.[0];
  expect(first).toBeDefined();
  if (!first) {
    throw new Error("missing first recording");
  }
  await updateTrackRecording({
    id: first.id,
    meetingId: mocks.meeting.id,
    patch: { durationMs: 1000, sizeBytes: 100, status: "completed" },
  });
  // Repeated callbacks within the same room must not start another composite.
  await synchronizeHumanInterviewTrackRecordings("human_meeting");
  expect(mocks.start).toHaveBeenCalledTimes(1);
  mocks.rooms.mockResolvedValue([{ name: "human_meeting", sid: "RM_rejoined" }]);
  await synchronizeHumanInterviewTrackRecordings("human_meeting");
  await synchronizeHumanInterviewTrackRecordings("human_meeting");
  expect(mocks.start).toHaveBeenCalledTimes(2);
  expect(mocks.meeting.recordingTracks).toEqual([
    expect.objectContaining({ durationMs: 1000, id: first.id, status: "completed" }),
    expect.objectContaining({ role: "mixed", status: "active", trackId: "mixed:RM_rejoined" }),
  ]);
  expect(mocks.meeting.recordingTracks?.[1]?.fileKey).not.toBe(first.fileKey);
  expect(mocks.stop).not.toHaveBeenCalled();
});

it("does not create a recording when the room is absent", async () => {
  mocks.rooms.mockResolvedValue([]);
  await synchronizeHumanInterviewTrackRecordings("human_meeting");
  expect(mocks.start).not.toHaveBeenCalled();
  expect(mocks.meeting.recordingTracks).toBeNull();
});

it("does not duplicate a still-active pre-upgrade room recording", async () => {
  await synchronizeHumanInterviewTrackRecordings("human_meeting");
  const first = mocks.meeting.recordingTracks?.[0];
  if (!first) {
    throw new Error("missing first recording");
  }
  first.trackId = "mixed";
  await synchronizeHumanInterviewTrackRecordings("human_meeting");
  expect(mocks.start).toHaveBeenCalledTimes(1);
  await updateTrackRecording({
    id: first.id,
    meetingId: mocks.meeting.id,
    patch: { durationMs: 1000, sizeBytes: 100, status: "completed" },
  });
  mocks.rooms.mockResolvedValue([{ name: "human_meeting", sid: "RM_rejoined" }]);
  await synchronizeHumanInterviewTrackRecordings("human_meeting");
  expect(mocks.start).toHaveBeenCalledTimes(2);
  expect(mocks.meeting.recordingTracks).toHaveLength(2);
});
