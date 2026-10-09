import postgres from "postgres";
import { createDatabase } from "@app/database";
import { createHumanRealtimeTranscriptDao } from "@app/meeting-processing/human-interview";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const testUrl = process.env.HUMAN_TRANSCRIPTION_TEST_DATABASE_URL;
if (testUrl && !new URL(testUrl).pathname.includes("_test_")) {
  throw new Error("必须使用隔离测试库");
}
describe.skipIf(!testUrl)("realtime transcript publication", () => {
  const schema = `human_publish_${crypto.randomUUID().replaceAll("-", "")}`;
  const client = postgres(testUrl ?? "postgres://localhost/unused", {
    connection: { search_path: schema },
    max: 2,
    onnotice: () => {},
  });
  const publisher = createHumanRealtimeTranscriptDao(createDatabase(client));
  beforeAll(async () => {
    await client.unsafe(`CREATE SCHEMA "${schema}"`);
    for (const table of [
      "human_transcription_run",
      "human_transcription_event",
      "human_interview_meeting",
      "human_interview_meeting_round",
      "human_interview_round",
      "human_interview_meeting_interviewer",
      "meeting_session",
      "meeting_transcript_revision",
      "meeting_transcript_turn",
      "recruiting_meeting_context",
      "user",
      "meeting_note",
      "meeting_search_projection",
    ]) {
      // The fixed table allow-list and generated schema stay entirely inside the test database.
      await client.unsafe(
        `CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`,
      );
    }
  });
  afterAll(async () => {
    await client.unsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  });
  async function fixture(mode = "server_realtime", gap = false) {
    const id = crypto.randomUUID();
    await client`insert into "user" (id,name,email) values ('owner','Test','test@example.invalid') on conflict do nothing`;
    await client`insert into human_interview_meeting (id,organization_id,created_by,title,status,transcription_mode) values (${id},'org','owner','test','ended',${mode})`;
    await client`insert into human_interview_round (id,organization_id,recruiting_record_id,format,label,round_kind) values (${id},'org','record','online','test','second_interview')`;
    await client`insert into human_interview_meeting_round (meeting_id,round_id,organization_id) values (${id},${id},'org')`;
    await client`insert into human_transcription_run (id,organization_id,meeting_id,room_name,mode,participants,status,started_at,ended_at,drained_at,event_seq) values (${id},'org',${id},${`human_${id}`},${mode},${JSON.stringify({ candidate: { displayName: "候选人", role: "candidate" } })},'finalizing',now()-interval '1 minute',now(),now(),1)`;
    const event = {
      endMs: 1000,
      eventId: id,
      itemId: id,
      kind: "final",
      participantIdentity: "candidate",
      providerTaskId: "task",
      revision: 0,
      startMs: 100,
      streamEpoch: "epoch",
      text: "我负责研发和测试",
      trackId: "track",
    };
    await client`insert into human_transcription_event (id,run_id,event_id,event_seq,generation,payload) values (${id},${id},${id},1,1,${JSON.stringify(event)})`;
    if (gap) {
      await client`insert into human_transcription_event (id,run_id,event_id,event_seq,generation,payload) values (${`${id}-gap`},${id},'gap',2,1,${JSON.stringify({ ...event, eventId: "gap", itemId: "gap", kind: "gap" })})`;
    }
    if (gap) {
      await client`update human_transcription_run set event_seq=2 where id=${id}`;
    }
    return id;
  }
  it("publishes a real source revision once, before any recording exists", async () => {
    const id = await fixture();
    const result = await publisher.publish(id);
    expect(result?.eligible).toBe(true);
    expect(await publisher.publish(id)).toBeNull();
    const [session] = await client`select * from meeting_session where realtime_run_id=${id}`;
    const [revision] =
      await client`select * from meeting_transcript_revision where realtime_run_id=${id}`;
    expect(session.manifest_sha256).toBeNull();
    expect(session.source_kind).toBe("livekit_realtime");
    expect(session.active_transcript_revision_id).toBe(revision.id);
    expect(revision.kind).toBe("realtime");
    expect(revision.processing_run_id).toBeNull();
    expect(revision.source_snapshot.runId).toBe(id);
    expect(revision.quality).toBe("eligible");
  });
  it("retains gaps for review without activating them for AI", async () => {
    const id = await fixture("server_realtime", true);
    const result = await publisher.publish(id);
    expect(result?.eligible).toBe(false);
    const [session] = await client`select * from meeting_session where realtime_run_id=${id}`;
    expect(session.active_transcript_revision_id).toBeNull();
    expect(session.review_transcript_revision_id).toBeTruthy();
    expect(session.transcription_status).toBe("failed");
  });

  it("does not publish or evaluate a collector snapshot while the meeting is live", async () => {
    const id = await fixture();
    await client`update human_interview_meeting set status='in_progress' where id=${id}`;
    expect(await publisher.publish(id)).toBeNull();
    expect(await client`select id from meeting_session where realtime_run_id=${id}`).toHaveLength(
      0,
    );
  });
  it("an unclosed audio stream cannot be promoted even when final text exists", async () => {
    const id = await fixture();
    const eventId = crypto.randomUUID();
    await client`insert into human_transcription_event (id,run_id,event_id,event_seq,generation,payload) values (${eventId},${id},${eventId},2,1,${JSON.stringify({ endMs: 0, eventId, itemId: eventId, kind: "stream_started", participantIdentity: "candidate", providerTaskId: "task", revision: 0, startMs: 0, streamEpoch: "unclosed", text: "", trackId: "track" })})`;
    await client`update human_transcription_run set event_seq=2 where id=${id}`;
    const result = await publisher.publish(id);
    expect(result?.eligible).toBe(false);
    const [session] =
      await client`select active_transcript_revision_id, review_transcript_revision_id from meeting_session where realtime_run_id=${id}`;
    expect(session.active_transcript_revision_id).toBeNull();
    expect(session.review_transcript_revision_id).toBeTruthy();
  });

  it("shadow cannot create business materials or evaluation inputs", async () => {
    const id = await fixture("shadow");
    expect(await publisher.publish(id)).toBeNull();
    expect(await client`select id from meeting_session where realtime_run_id=${id}`).toHaveLength(
      0,
    );
  });
});
