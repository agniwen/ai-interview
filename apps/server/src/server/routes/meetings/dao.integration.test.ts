import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../../lib/server/db/index";
import {
  meetingAuditLog,
  meetingNote,
  meetingSession,
  member,
  organization,
  user,
} from "@app/db-schema/schema";
import {
  listMeetingAccessGrants,
  listMeetingSessionsForAccess,
  reassignMeetingOwner,
  replaceMeetingAccessGrants,
} from "./dao";
import { deleteMeetingNote, updateMeetingNote } from "./routes/notes/dao";

const ORGANIZATION_ID = "meeting_collaboration_test_org";
const CREATOR_ID = "meeting_collaboration_test_creator";
const EDITOR_ID = "meeting_collaboration_test_editor";
const MEETING_ID = "meeting_collaboration_test_meeting";
const NOTE_ID = "meeting_collaboration_test_note";

async function clean(): Promise<void> {
  await db.delete(organization).where(eq(organization.id, ORGANIZATION_ID));
  await db.delete(user).where(eq(user.id, CREATOR_ID));
  await db.delete(user).where(eq(user.id, EDITOR_ID));
}

describe("Meeting collaboration DAO", () => {
  beforeEach(async () => {
    await clean();
    await db.insert(user).values([
      {
        createdAt: new Date(),
        email: "meeting-creator@example.test",
        emailVerified: true,
        id: CREATOR_ID,
        name: "Meeting Creator",
        updatedAt: new Date(),
      },
      {
        createdAt: new Date(),
        email: "meeting-editor@example.test",
        emailVerified: true,
        id: EDITOR_ID,
        name: "Meeting Editor",
        updatedAt: new Date(),
      },
    ]);
    await db.insert(organization).values({
      createdAt: new Date(),
      id: ORGANIZATION_ID,
      name: "Meeting Collaboration Test",
      slug: "meeting-collaboration-test",
    });
    await db.insert(member).values([
      {
        createdAt: new Date(),
        id: "meeting_collaboration_creator_member",
        organizationId: ORGANIZATION_ID,
        role: "owner",
        userId: CREATOR_ID,
      },
      {
        createdAt: new Date(),
        id: "meeting_collaboration_editor_member",
        organizationId: ORGANIZATION_ID,
        role: "member",
        userId: EDITOR_ID,
      },
    ]);
    const now = new Date("2026-08-09T06:00:00.000Z");
    await db.insert(meetingSession).values({
      id: MEETING_ID,
      manifestSha256: "a".repeat(64),
      organizationId: ORGANIZATION_ID,
      ownerId: CREATOR_ID,
      savedAt: now,
      startedAt: now,
      status: "ready",
      title: "DAO integration meeting",
    });
    await db.insert(meetingNote).values({
      authorId: EDITOR_ID,
      authorName: "Meeting Editor",
      body: "Keep this note if governance audit fails",
      id: NOTE_ID,
      meetingId: MEETING_ID,
      meetingTimeMs: 1000,
      organizationId: ORGANIZATION_ID,
    });
  }, 30_000);

  afterEach(clean, 30_000);

  it("revokes a selected share permanently when its membership is deleted", async () => {
    await expect(
      replaceMeetingAccessGrants({
        actorId: CREATOR_ID,
        meetingId: MEETING_ID,
        organizationId: ORGANIZATION_ID,
        ownerId: CREATOR_ID,
        share: {
          grants: [{ role: "editor", userId: EDITOR_ID }],
          visibility: "restricted",
        },
      }),
    ).resolves.toBe(true);
    await expect(
      listMeetingSessionsForAccess({
        includeAllPrivateMeetings: false,
        organizationId: ORGANIZATION_ID,
        userId: EDITOR_ID,
      }),
    ).resolves.toHaveLength(1);

    await db.delete(member).where(eq(member.id, "meeting_collaboration_editor_member"));
    await db.insert(member).values({
      createdAt: new Date(),
      id: "meeting_collaboration_rejoined_member",
      organizationId: ORGANIZATION_ID,
      role: "member",
      userId: EDITOR_ID,
    });

    await expect(
      listMeetingSessionsForAccess({
        includeAllPrivateMeetings: false,
        organizationId: ORGANIZATION_ID,
        userId: EDITOR_ID,
      }),
    ).resolves.toHaveLength(0);
    await expect(
      listMeetingAccessGrants({ meetingId: MEETING_ID, organizationId: ORGANIZATION_ID }),
    ).resolves.toEqual([]);
  });

  it("does not reassign a meeting whose current owner is still a workspace member", async () => {
    await expect(
      reassignMeetingOwner({
        actorId: CREATOR_ID,
        meetingId: MEETING_ID,
        organizationId: ORGANIZATION_ID,
        userId: EDITOR_ID,
      }),
    ).resolves.toBe("not-custodied");

    await expect(
      db.query.meetingSession.findFirst({ where: { id: MEETING_ID } }),
    ).resolves.toMatchObject({ custodianId: null, ownerId: CREATOR_ID });
  });

  it("serializes concurrent custody reassignment and writes one audit entry", async () => {
    await db.delete(member).where(eq(member.id, "meeting_collaboration_creator_member"));

    await expect(
      Promise.all([
        reassignMeetingOwner({
          actorId: EDITOR_ID,
          meetingId: MEETING_ID,
          organizationId: ORGANIZATION_ID,
          userId: EDITOR_ID,
        }),
        reassignMeetingOwner({
          actorId: EDITOR_ID,
          meetingId: MEETING_ID,
          organizationId: ORGANIZATION_ID,
          userId: EDITOR_ID,
        }),
      ]),
    ).resolves.toEqual(expect.arrayContaining(["updated", "not-custodied"]));

    await expect(
      db.query.meetingSession.findFirst({ where: { id: MEETING_ID } }),
    ).resolves.toMatchObject({ custodianId: EDITOR_ID });
    await expect(
      db
        .select({ id: meetingAuditLog.id })
        .from(meetingAuditLog)
        .where(eq(meetingAuditLog.meetingId, MEETING_ID)),
    ).resolves.toHaveLength(1);
  });

  it("rolls back an administrator deletion when its governance audit cannot be written", async () => {
    await expect(
      deleteMeetingNote({
        canGovern: true,
        meetingId: MEETING_ID,
        noteId: NOTE_ID,
        organizationId: ORGANIZATION_ID,
        userId: "missing_audit_actor",
      }),
    ).rejects.toThrow();

    await expect(db.query.meetingNote.findFirst({ where: { id: NOTE_ID } })).resolves.toMatchObject(
      { id: NOTE_ID },
    );
  });

  it("rolls back an administrator revision when its governance audit cannot be written", async () => {
    await expect(
      updateMeetingNote({
        actorId: "missing_audit_actor",
        canEditAll: true,
        canGovern: true,
        meetingId: MEETING_ID,
        note: { body: "This revision must roll back" },
        noteId: NOTE_ID,
        organizationId: ORGANIZATION_ID,
      }),
    ).rejects.toThrow();

    await expect(db.query.meetingNote.findFirst({ where: { id: NOTE_ID } })).resolves.toMatchObject(
      { body: "Keep this note if governance audit fails" },
    );
  });
});
