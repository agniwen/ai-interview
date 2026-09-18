/* oxlint-disable anti-slop/no-module-mocking, max-classes-per-file -- Exercise real reconciliation SQL in a private database schema, replacing external LiveKit, recording and publication boundaries to avoid side effects. */
import postgres from "postgres";
import type { reconcileHumanTranscriptions } from "./human-transcription";
import { createDatabase } from "@app/database";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRoom: vi.fn(),
  deleteRoom: vi.fn(),
  dispatch: vi.fn(),
  listDispatch: vi.fn().mockResolvedValue([]),
  listRooms: vi.fn().mockResolvedValue([{ name: "room" }]),
  publish: vi.fn(),
  scope: vi.fn(),
  stopRecording: vi.fn(),
}));
vi.mock("../dao/human-interview-recording-tracks", () => ({
  loadTrackRecordingScope: mocks.scope,
}));
vi.mock("../utils/human-interview-recording-service", () => ({
  stopActiveHumanInterviewRecordingByRoomName: mocks.stopRecording,
}));
vi.mock("@app/meeting-processing/human-interview", () => ({
  createHumanRealtimeTranscriptDao: () => ({ publish: mocks.publish }),
}));
vi.mock("livekit-server-sdk", () => ({
  AgentDispatchClient: class {
    listDispatch = mocks.listDispatch;
    createDispatch = mocks.dispatch;
  },
  RoomServiceClient: class {
    createRoom = mocks.createRoom;
    deleteRoom = mocks.deleteRoom;
    listRooms = mocks.listRooms;
  },
}));

const testUrl = process.env.HUMAN_TRANSCRIPTION_TEST_DATABASE_URL;
if (testUrl && !new URL(testUrl).pathname.includes("_test_")) {
  throw new Error("必须使用隔离测试库");
}
const schema = `human_reconcile_${crypto.randomUUID().replaceAll("-", "")}`;
const client = postgres(testUrl ?? "postgres://localhost/unused", {
  connection: { search_path: schema },
  max: 2,
  onnotice: () => {},
});
let reconcile: typeof reconcileHumanTranscriptions;
beforeAll(async () => {
  if (!testUrl) {
    return;
  }
  await client.unsafe(`CREATE SCHEMA "${schema}"`);
  for (const table of [
    "human_transcription_run",
    "human_transcription_event",
    "human_interview_meeting",
  ]) {
    await client.unsafe(
      `CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`,
    );
  }
  vi.doMock("../../../../../../lib/server/db/index", () => ({ db: createDatabase(client) }));
  const application = await import("./human-transcription");
  reconcile = application.reconcileHumanTranscriptions;
  vi.stubEnv("LIVEKIT_URL", "ws://localhost:7880");
  vi.stubEnv("LIVEKIT_API_KEY", "test");
  vi.stubEnv("LIVEKIT_API_SECRET", "test");
});
afterAll(async () => {
  if (testUrl) {
    await client.unsafe(`DROP SCHEMA "${schema}" CASCADE`);
  }
  await client.end();
  vi.unstubAllEnvs();
});

it.skipIf(!testUrl)(
  "replaces an exited collector without cleaning up the live meeting, then cleans up on explicit end",
  async () => {
    const id = crypto.randomUUID();
    await client`insert into human_interview_meeting (id,organization_id,title,status,transcription_mode) values (${id},'org','test','in_progress','server_realtime')`;
    await client`insert into human_transcription_run (id,organization_id,meeting_id,room_name,mode,participants,status,execution_id,started_at,created_at,heartbeat_at,cutoff_at,drained_at) values (${id},'org',${id},'room','server_realtime',${JSON.stringify({ candidate: { displayName: "候选人", role: "candidate" } })},'recovering','old-execution',now()-interval '10 minutes',now()-interval '10 minutes',now(),now(),now())`;
    mocks.scope.mockResolvedValue({
      meeting: { id, status: "in_progress", transcriptionMode: "server_realtime" },
    });
    mocks.dispatch.mockResolvedValue({ id: "new-dispatch" });
    mocks.publish.mockResolvedValue(null);
    mocks.stopRecording.mockImplementation(async () => {});
    await reconcile();
    const [restarted] = await client`select * from human_transcription_run where id=${id}`;
    expect(restarted.generation).toBe(2);
    expect(restarted.status).toBe("starting");
    expect(restarted.dispatch_id).toBe("new-dispatch");
    expect(restarted.ended_at).toBeNull();
    expect(restarted.cutoff_at).toBeNull();
    expect(restarted.drained_at).toBeNull();
    expect(mocks.deleteRoom).not.toHaveBeenCalled();
    expect(mocks.stopRecording).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
    await client`update human_interview_meeting set status='ended' where id=${id}`;
    await client`update human_transcription_run set status='finalizing', ended_at=now(),cutoff_at=now(),drained_at=now() where id=${id}`;
    await reconcile();
    expect(mocks.stopRecording).toHaveBeenCalledWith("room");
    expect(mocks.deleteRoom).toHaveBeenCalledWith("room");
    expect(mocks.publish).toHaveBeenCalledWith(id);
  },
);
