import { afterAll, beforeAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { organization, user, studioHumanInterviewMeeting } from "@app/db-schema/schema";
import type { HumanInterviewRecordingTrack } from "@app/db-schema/human-interview-recording";
import { db } from "../../../../../../../lib/server/db/index";
import { claimTrackRecordings, updateTrackRecording } from "../human-interview-recording-tracks";

const id = `track-regression-${crypto.randomUUID()}`;
const descriptor: HumanInterviewRecordingTrack = {
  displayName: "候选人",
  durationMs: 0,
  egressId: null,
  endedAtMs: null,
  error: null,
  fileKey: `${id}/1.ogg`,
  id: crypto.randomUUID(),
  participantIdentity: "candidate-1",
  publishedAtMs: 1000,
  role: "candidate",
  sizeBytes: 0,
  startedAtMs: null,
  status: "starting",
  trackId: "mic-1",
  updatedAtMs: 1000,
};

beforeAll(async () => {
  await db
    .insert(user)
    .values({ email: `${id}@example.test`, emailVerified: false, id, name: "test" });
  await db.insert(organization).values({ createdAt: new Date(), id, name: "test", slug: id });
  await db
    .insert(studioHumanInterviewMeeting)
    .values({ createdBy: id, id, organizationId: id, status: "in_progress", title: "track test" });
});
afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, id));
  await db.delete(user).where(eq(user.id, id));
});

it("concurrent webhook claims start one recording and preserve completed state against late active events", async () => {
  const claims = await Promise.all(
    [1, 2].map(() =>
      claimTrackRecordings({ meetingId: id, organizationId: id, proposed: [descriptor] }),
    ),
  );
  expect(claims.flat()).toHaveLength(1);
  await updateTrackRecording({
    id: descriptor.id,
    meetingId: id,
    patch: {
      durationMs: 1000,
      egressId: "egress-1",
      endedAtMs: 2100,
      sizeBytes: 100,
      startedAtMs: 1100,
      status: "completed",
    },
  });
  await updateTrackRecording({
    id: descriptor.id,
    meetingId: id,
    patch: { durationMs: 0, status: "active" },
  });
  const row = await db.query.studioHumanInterviewMeeting.findFirst({ where: { id } });
  expect(row?.recordingTracks?.[0]).toMatchObject({ durationMs: 1000, status: "completed" });
  const reconnect = {
    ...descriptor,
    fileKey: `${id}/2.ogg`,
    id: crypto.randomUUID(),
    trackId: "mic-2",
  };
  expect(
    await claimTrackRecordings({ meetingId: id, organizationId: id, proposed: [reconnect] }),
  ).toHaveLength(1);
  await db
    .update(studioHumanInterviewMeeting)
    .set({ status: "ended" })
    .where(eq(studioHumanInterviewMeeting.id, id));
  expect(
    await claimTrackRecordings({
      meetingId: id,
      organizationId: id,
      proposed: [{ ...reconnect, id: crypto.randomUUID(), trackId: "mic-3" }],
    }),
  ).toEqual([]);
});
