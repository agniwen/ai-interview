import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../../lib/server/db/index";
import {
  meetingAuditLog,
  meetingNote,
  meetingRecruitingContext,
  meetingSession,
  member,
  organization,
  recruitingGroup,
  recruitingGroupMember,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import {
  listMeetingRecruitingRecordCandidates,
  loadMeetingRecruitingContext,
  replaceMeetingRecruitingContext,
} from "./recruiting-context-dao";
import { listMeetingSessionsForAccess } from "./dao";

const ORG_A = "meeting_recruiting_context_org_a";
const ORG_B = "meeting_recruiting_context_org_b";
const OWNER_ID = "meeting_recruiting_context_owner";
const RECRUITER_ID = "meeting_recruiting_context_recruiter";
const MEETING_ID = "meeting_recruiting_context_meeting";
const CANDIDATE_A = "meeting_recruiting_context_candidate_a";
const CANDIDATE_A2 = "meeting_recruiting_context_candidate_a2";
const CANDIDATE_B = "meeting_recruiting_context_candidate_b";

async function clean(): Promise<void> {
  await db.delete(organization).where(eq(organization.id, ORG_A));
  await db.delete(organization).where(eq(organization.id, ORG_B));
  await db.delete(user).where(eq(user.id, OWNER_ID));
  await db.delete(user).where(eq(user.id, RECRUITER_ID));
}

describe("Meeting Recruiting Context Link", () => {
  beforeEach(async () => {
    await clean();
    const now = new Date("2026-08-09T10:30:00.000Z");
    await db.insert(user).values([
      {
        createdAt: now,
        email: "meeting-context-owner@example.test",
        emailVerified: true,
        id: OWNER_ID,
        name: "Meeting Owner",
        updatedAt: now,
      },
      {
        createdAt: now,
        email: "meeting-context-recruiter@example.test",
        emailVerified: true,
        id: RECRUITER_ID,
        name: "Recruiter",
        updatedAt: now,
      },
    ]);
    await db.insert(organization).values([
      { createdAt: now, id: ORG_A, name: "Context A", slug: "meeting-context-a" },
      { createdAt: now, id: ORG_B, name: "Context B", slug: "meeting-context-b" },
    ]);
    await db.insert(member).values({
      createdAt: now,
      id: "meeting_recruiting_context_owner_member",
      organizationId: ORG_A,
      role: "owner",
      userId: OWNER_ID,
    });
    await db.insert(meetingSession).values({
      id: MEETING_ID,
      manifestSha256: "a".repeat(64),
      organizationId: ORG_A,
      ownerId: OWNER_ID,
      savedAt: now,
      startedAt: now,
      status: "ready",
      title: "Recruiting context meeting",
    });
    await db.insert(meetingSession).values({
      id: "meeting_recruiting_context_unlinked_meeting",
      manifestSha256: "b".repeat(64),
      organizationId: ORG_A,
      ownerId: RECRUITER_ID,
      savedAt: now,
      startedAt: now,
      status: "ready",
      title: "Unlinked workspace meeting",
      visibility: "workspace",
    });
    await db.insert(meetingNote).values({
      authorId: OWNER_ID,
      authorName: "Meeting Owner",
      body: "Preserved meeting artifact",
      id: "meeting_recruiting_context_note",
      meetingId: MEETING_ID,
      meetingTimeMs: 1000,
      organizationId: ORG_A,
    });
    await db.insert(studioInterview).values([
      {
        candidateName: "Visible Candidate",
        createdAt: now,
        createdBy: RECRUITER_ID,
        id: CANDIDATE_A,
        organizationId: ORG_A,
        updatedAt: now,
      },
      {
        candidateName: "Owner Candidate",
        createdAt: now,
        createdBy: OWNER_ID,
        id: CANDIDATE_A2,
        organizationId: ORG_A,
        updatedAt: now,
      },
      {
        candidateName: "Foreign Candidate",
        createdAt: now,
        createdBy: RECRUITER_ID,
        id: CANDIDATE_B,
        organizationId: ORG_B,
        updatedAt: now,
      },
    ]);
  }, 30_000);

  afterEach(clean, 30_000);

  it("changes the single link transactionally while preserving meeting artifacts", async () => {
    await expect(
      replaceMeetingRecruitingContext({
        actorId: OWNER_ID,
        meetingId: MEETING_ID,
        organizationId: ORG_A,
        recruitingRecordId: CANDIDATE_A,
      }),
    ).resolves.toBe("updated");
    await expect(
      replaceMeetingRecruitingContext({
        actorId: OWNER_ID,
        meetingId: MEETING_ID,
        organizationId: ORG_A,
        recruitingRecordId: CANDIDATE_A2,
      }),
    ).resolves.toBe("updated");

    await expect(
      loadMeetingRecruitingContext({
        meetingId: MEETING_ID,
        organizationId: ORG_A,
        visibilityScope: { kind: "all" },
      }),
    ).resolves.toMatchObject({ record: { id: CANDIDATE_A2 } });
    await expect(
      db
        .select({ meetingId: meetingRecruitingContext.meetingId })
        .from(meetingRecruitingContext)
        .where(eq(meetingRecruitingContext.meetingId, MEETING_ID)),
    ).resolves.toHaveLength(1);
    await expect(
      db.query.meetingNote.findFirst({ where: { meetingId: MEETING_ID } }),
    ).resolves.toMatchObject({ body: "Preserved meeting artifact" });
    await expect(
      db
        .select({ action: meetingAuditLog.action, detail: meetingAuditLog.detail })
        .from(meetingAuditLog)
        .where(
          and(
            eq(meetingAuditLog.meetingId, MEETING_ID),
            eq(meetingAuditLog.action, "meeting.recruiting_context_changed"),
          ),
        ),
    ).resolves.toEqual([
      {
        action: "meeting.recruiting_context_changed",
        detail: { nextRecruitingRecordId: CANDIDATE_A, previousRecruitingRecordId: null },
      },
      {
        action: "meeting.recruiting_context_changed",
        detail: {
          nextRecruitingRecordId: CANDIDATE_A2,
          previousRecruitingRecordId: CANDIDATE_A,
        },
      },
    ]);
  });

  it("does not create or reveal a cross-workspace link", async () => {
    await expect(
      replaceMeetingRecruitingContext({
        actorId: OWNER_ID,
        meetingId: MEETING_ID,
        organizationId: ORG_A,
        recruitingRecordId: CANDIDATE_B,
      }),
    ).resolves.toBe("invalid-record");
    await expect(
      loadMeetingRecruitingContext({
        meetingId: MEETING_ID,
        organizationId: ORG_B,
        visibilityScope: { kind: "all" },
      }),
    ).resolves.toBeNull();
  });

  it("rejects cross-workspace links at the database boundary", async () => {
    await expect(
      db.insert(meetingRecruitingContext).values({
        linkedBy: OWNER_ID,
        meetingId: MEETING_ID,
        organizationId: ORG_A,
        recruitingRecordId: CANDIDATE_B,
      }),
    ).rejects.toThrow();
  });

  it("rechecks current membership before writing after waiting for the meeting lock", async () => {
    const { promise: locked, resolve: reportLocked } = Promise.withResolvers<true>();
    const { promise: released, resolve: releaseLock } = Promise.withResolvers<true>();
    const blocker = db.transaction(async (tx) => {
      await tx
        .select({ id: meetingSession.id })
        .from(meetingSession)
        .where(eq(meetingSession.id, MEETING_ID))
        .for("update");
      await tx.delete(member).where(eq(member.userId, OWNER_ID));
      reportLocked(true);
      await released;
    });
    await locked;

    const mutation = replaceMeetingRecruitingContext({
      actorId: OWNER_ID,
      meetingId: MEETING_ID,
      organizationId: ORG_A,
      recruitingRecordId: CANDIDATE_A,
    });
    releaseLock(true);
    await blocker;

    await expect(mutation).resolves.toBe("forbidden");
  });

  it("rechecks recruiting visibility before writing after waiting for the meeting lock", async () => {
    const { promise: locked, resolve: reportLocked } = Promise.withResolvers<true>();
    const { promise: released, resolve: releaseLock } = Promise.withResolvers<true>();
    const blocker = db.transaction(async (tx) => {
      await tx
        .select({ id: meetingSession.id })
        .from(meetingSession)
        .where(eq(meetingSession.id, MEETING_ID))
        .for("update");
      await tx
        .update(member)
        .set({ role: "member" })
        .where(and(eq(member.organizationId, ORG_A), eq(member.userId, OWNER_ID)));
      reportLocked(true);
      await released;
    });
    await locked;

    const mutation = replaceMeetingRecruitingContext({
      actorId: OWNER_ID,
      meetingId: MEETING_ID,
      organizationId: ORG_A,
      recruitingRecordId: CANDIDATE_A,
    });
    releaseLock(true);
    await blocker;

    await expect(mutation).resolves.toBe("invalid-record");
  });

  it("rechecks recruiting read permission when the final group membership is revoked", async () => {
    const groupId = "meeting_recruiting_context_group";
    const groupMemberId = "meeting_recruiting_context_group_member";
    await db
      .update(member)
      .set({ role: "member" })
      .where(and(eq(member.organizationId, ORG_A), eq(member.userId, OWNER_ID)));
    await db.insert(recruitingGroup).values({
      id: groupId,
      isDefault: true,
      name: "Meeting context group",
      organizationId: ORG_A,
    });
    await db.insert(recruitingGroupMember).values({
      groupId,
      id: groupMemberId,
      organizationId: ORG_A,
      role: "hr",
      userId: OWNER_ID,
    });

    const { promise: locked, resolve: reportLocked } = Promise.withResolvers<true>();
    const { promise: released, resolve: releaseLock } = Promise.withResolvers<true>();
    const blocker = db.transaction(async (tx) => {
      await tx
        .select({ id: meetingSession.id })
        .from(meetingSession)
        .where(eq(meetingSession.id, MEETING_ID))
        .for("update");
      await tx.delete(recruitingGroupMember).where(eq(recruitingGroupMember.id, groupMemberId));
      reportLocked(true);
      await released;
    });
    await locked;

    const mutation = replaceMeetingRecruitingContext({
      actorId: OWNER_ID,
      meetingId: MEETING_ID,
      organizationId: ORG_A,
      recruitingRecordId: CANDIDATE_A2,
    });
    releaseLock(true);
    await blocker;

    await expect(mutation).resolves.toBe("invalid-record");
  });

  it("removes the link without deleting either business record", async () => {
    await replaceMeetingRecruitingContext({
      actorId: OWNER_ID,
      meetingId: MEETING_ID,
      organizationId: ORG_A,
      recruitingRecordId: CANDIDATE_A,
    });

    await expect(
      replaceMeetingRecruitingContext({
        actorId: OWNER_ID,
        meetingId: MEETING_ID,
        organizationId: ORG_A,
        recruitingRecordId: null,
      }),
    ).resolves.toBe("updated");
    await expect(
      db.query.meetingRecruitingContext.findFirst({ where: { meetingId: MEETING_ID } }),
    ).resolves.toBeUndefined();
    await expect(
      db.query.meetingSession.findFirst({ where: { id: MEETING_ID } }),
    ).resolves.toMatchObject({ id: MEETING_ID });
    await expect(
      db.query.studioInterview.findFirst({ where: { id: CANDIDATE_A } }),
    ).resolves.toMatchObject({ id: CANDIDATE_A });
  });

  it("only suggests recruiting records inside the caller's recruiting visibility scope", async () => {
    await expect(
      listMeetingRecruitingRecordCandidates({
        limit: 20,
        organizationId: ORG_A,
        search: "Candidate",
        visibilityScope: { kind: "restricted", userIds: [RECRUITER_ID] },
      }),
    ).resolves.toEqual([
      expect.objectContaining({ candidateName: "Visible Candidate", id: CANDIDATE_A }),
    ]);
  });

  it("lists only accessible meetings linked to the selected recruiting record", async () => {
    await replaceMeetingRecruitingContext({
      actorId: OWNER_ID,
      meetingId: MEETING_ID,
      organizationId: ORG_A,
      recruitingRecordId: CANDIDATE_A,
    });

    await expect(
      listMeetingSessionsForAccess({
        includeAllPrivateMeetings: false,
        organizationId: ORG_A,
        recruitingRecordId: CANDIDATE_A,
        userId: OWNER_ID,
      }),
    ).resolves.toEqual([expect.objectContaining({ id: MEETING_ID })]);
  });
});
