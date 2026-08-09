import { setTimeout as delay } from "node:timers/promises";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  meetingAccessGrant,
  meetingNote,
  meetingSearchProjection,
  meetingSession,
  member,
  organization,
  user,
} from "@arc/db-schema/schema";
import { createMeetingNote, deleteMeetingNote, updateMeetingNote } from "../notes/dao";
import { searchMeetingSessionsForAccess } from "./dao";

const TEST_SUFFIX = String(process.pid);
const ORGANIZATION_ID = `meeting_search_test_org_${TEST_SUFFIX}`;
const CREATOR_ID = `meeting_search_test_creator_${TEST_SUFFIX}`;
const SELECTED_ID = `meeting_search_test_selected_${TEST_SUFFIX}`;
const UNSELECTED_ID = `meeting_search_test_unselected_${TEST_SUFFIX}`;
const ADMIN_ID = `meeting_search_test_admin_${TEST_SUFFIX}`;
const PRIVATE_MEETING_ID = `meeting_search_test_private_${TEST_SUFFIX}`;
const WORKSPACE_MEETING_ID = `meeting_search_test_workspace_${TEST_SUFFIX}`;
const TRASHED_MEETING_ID = `meeting_search_test_trashed_${TEST_SUFFIX}`;
const GRANT_ID = `meeting_search_test_grant_${TEST_SUFFIX}`;

function memberId(userId: string): string {
  return `${userId}_member`;
}

async function clean(): Promise<void> {
  await db.delete(organization).where(eq(organization.id, ORGANIZATION_ID));
  await db.delete(user).where(inArray(user.id, [CREATOR_ID, SELECTED_ID, UNSELECTED_ID, ADMIN_ID]));
}

function searchAs(userId: string, query = "Quartz", timeZone = "Asia/Shanghai") {
  return searchMeetingSessionsForAccess({
    limit: 20,
    organizationId: ORGANIZATION_ID,
    query,
    timeZone,
    userId,
  }).then((result) => result.records);
}

describe("Meeting library search DAO", () => {
  beforeEach(async () => {
    await clean();
    const now = new Date("2026-08-09T07:00:00.000Z");
    await db.insert(user).values(
      [CREATOR_ID, SELECTED_ID, UNSELECTED_ID, ADMIN_ID].map((id) => ({
        createdAt: now,
        email: `${id}@example.test`,
        emailVerified: true,
        id,
        name: "Meeting Search Fixture",
        updatedAt: now,
      })),
    );
    await db.insert(organization).values({
      createdAt: now,
      id: ORGANIZATION_ID,
      name: "Meeting Search Test",
      slug: `meeting-search-test-${TEST_SUFFIX}`,
    });
    await db.insert(member).values(
      [CREATOR_ID, SELECTED_ID, UNSELECTED_ID, ADMIN_ID].map((userId) => ({
        createdAt: now,
        id: memberId(userId),
        organizationId: ORGANIZATION_ID,
        role: userId === ADMIN_ID ? "admin" : "member",
        userId,
      })),
    );
    await db.insert(meetingSession).values([
      {
        id: PRIVATE_MEETING_ID,
        manifestSha256: "1".repeat(64),
        organizationId: ORGANIZATION_ID,
        ownerId: CREATOR_ID,
        savedAt: now,
        startedAt: now,
        status: "ready",
        title: "Private Quartz roadmap",
        visibility: "restricted",
      },
      {
        id: WORKSPACE_MEETING_ID,
        manifestSha256: "2".repeat(64),
        organizationId: ORGANIZATION_ID,
        ownerId: CREATOR_ID,
        savedAt: new Date(now.getTime() - 1000),
        startedAt: now,
        status: "ready",
        title: "Workspace Quartz roadmap",
        visibility: "workspace",
      },
      {
        id: TRASHED_MEETING_ID,
        manifestSha256: "3".repeat(64),
        organizationId: ORGANIZATION_ID,
        ownerId: CREATOR_ID,
        purgeAfter: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        savedAt: new Date(now.getTime() - 2000),
        startedAt: now,
        status: "trashed",
        title: "Trashed Quartz roadmap",
        trashedAt: now,
        trashedFromStatus: "ready",
        visibility: "workspace",
      },
    ]);
    await db.insert(meetingSearchProjection).values([
      {
        meetingId: PRIVATE_MEETING_ID,
        organizationId: ORGANIZATION_ID,
        searchText: "Private Quartz roadmap",
      },
      {
        meetingId: WORKSPACE_MEETING_ID,
        organizationId: ORGANIZATION_ID,
        searchText: "Workspace Quartz roadmap",
      },
      {
        meetingId: TRASHED_MEETING_ID,
        organizationId: ORGANIZATION_ID,
        searchText: "Trashed Quartz roadmap",
      },
    ]);
    await db.insert(meetingAccessGrant).values({
      createdBy: CREATOR_ID,
      id: GRANT_ID,
      meetingId: PRIVATE_MEETING_ID,
      memberId: memberId(SELECTED_ID),
      organizationId: ORGANIZATION_ID,
      role: "viewer",
    });
  }, 30_000);

  afterEach(clean, 30_000);

  it("applies owner, selected-share, workspace, and administrator access before results", async () => {
    await expect(searchAs(CREATOR_ID)).resolves.toHaveLength(2);
    await expect(searchAs(SELECTED_ID)).resolves.toHaveLength(2);
    await expect(searchAs(UNSELECTED_ID)).resolves.toMatchObject([{ id: WORKSPACE_MEETING_ID }]);
    await expect(searchAs(ADMIN_ID)).resolves.toHaveLength(2);
  });

  it("uses current membership and role instead of a stale request snapshot", async () => {
    await db
      .update(member)
      .set({ role: "member" })
      .where(eq(member.id, memberId(ADMIN_ID)));
    await expect(searchAs(ADMIN_ID)).resolves.toMatchObject([{ id: WORKSPACE_MEETING_ID }]);

    await db.delete(member).where(eq(member.id, memberId(UNSELECTED_ID)));
    await expect(searchAs(UNSELECTED_ID)).resolves.toEqual([]);
  });

  it("waits for a concurrent administrator downgrade before evaluating private ACL", async () => {
    let pendingSearch: ReturnType<typeof searchAs> | undefined;
    await db.transaction(async (tx) => {
      await tx
        .update(member)
        .set({ role: "member" })
        .where(eq(member.id, memberId(ADMIN_ID)));
      pendingSearch = searchAs(ADMIN_ID);
      await delay(50);
    });

    await expect(pendingSearch).resolves.toMatchObject([{ id: WORKSPACE_MEETING_ID }]);
  });

  it("matches current creator and saved date without exposing inaccessible meetings", async () => {
    await expect(searchAs(UNSELECTED_ID, "Fixture")).resolves.toMatchObject([
      { id: WORKSPACE_MEETING_ID, match: { kind: "creator" } },
    ]);
    await expect(searchAs(UNSELECTED_ID, "2026-08-09")).resolves.toMatchObject([
      { id: WORKSPACE_MEETING_ID, match: { kind: "date" } },
    ]);

    await db
      .update(meetingSession)
      .set({ savedAt: new Date("2026-08-08T16:30:00.000Z") })
      .where(eq(meetingSession.id, WORKSPACE_MEETING_ID));
    await expect(searchAs(UNSELECTED_ID, "2026/8/9")).resolves.toMatchObject([
      {
        id: WORKSPACE_MEETING_ID,
        match: { kind: "date", snippet: "2026/8/9" },
      },
    ]);
    await expect(searchAs(UNSELECTED_ID, "2026-08-08", "UTC")).resolves.toMatchObject([
      { id: WORKSPACE_MEETING_ID, match: { kind: "date" } },
    ]);
  });

  it("waits for a concurrent visibility revocation before returning snippets", async () => {
    let pendingSearch: ReturnType<typeof searchAs> | undefined;
    await db.transaction(async (tx) => {
      await tx
        .update(meetingSession)
        .set({ visibility: "restricted" })
        .where(eq(meetingSession.id, WORKSPACE_MEETING_ID));
      pendingSearch = searchAs(UNSELECTED_ID, "Workspace");
      await delay(50);
    });

    await expect(pendingSearch).resolves.toEqual([]);
  });

  it("does not wait on an inaccessible meeting that contains the exact query", async () => {
    let pendingSearch: ReturnType<typeof searchAs> | undefined;
    const raced = await db.transaction(async (tx) => {
      await tx
        .update(meetingSession)
        .set({ title: "Private Quartz roadmap" })
        .where(eq(meetingSession.id, PRIVATE_MEETING_ID));
      pendingSearch = searchAs(UNSELECTED_ID, "Private");
      return await Promise.race([pendingSearch, delay(1000).then(() => "blocked" as const)]);
    });

    await expect(pendingSearch).resolves.toEqual([]);
    expect(raced).toEqual([]);
  });

  it("bounds and ranks the candidate lock set before materializing results", async () => {
    const now = new Date("2026-08-09T08:00:00.000Z");
    const meetings = Array.from({ length: 90 }, (_, index) => ({
      id: `meeting_search_bounded_${TEST_SUFFIX}_${index}`,
      manifestSha256: String(index).padStart(64, "0").slice(-64),
      organizationId: ORGANIZATION_ID,
      ownerId: CREATOR_ID,
      savedAt: new Date(now.getTime() - index * 1000),
      startedAt: now,
      status: "ready" as const,
      title: "Bounded common match",
      visibility: "workspace" as const,
    }));
    await db.insert(meetingSession).values(meetings);
    await db.insert(meetingSearchProjection).values(
      meetings.map((meeting) => ({
        meetingId: meeting.id,
        organizationId: ORGANIZATION_ID,
        searchText: meeting.title,
      })),
    );

    let pendingSearch: ReturnType<typeof searchAs> | undefined;
    const raced = await db.transaction(async (tx) => {
      await tx
        .update(meetingSession)
        .set({ title: "Bounded common match" })
        .where(eq(meetingSession.id, meetings.at(-1)?.id ?? ""));
      pendingSearch = searchAs(UNSELECTED_ID, "Bounded");
      return await Promise.race([pendingSearch, delay(1000).then(() => "blocked" as const)]);
    });

    await expect(pendingSearch).resolves.toHaveLength(20);
    expect(raced).not.toBe("blocked");
  });

  it("reflects revocation and excludes trashed meetings without rebuilding the projection", async () => {
    await db.delete(meetingAccessGrant).where(eq(meetingAccessGrant.id, GRANT_ID));

    await expect(searchAs(SELECTED_ID)).resolves.toMatchObject([{ id: WORKSPACE_MEETING_ID }]);
    await expect(searchAs(UNSELECTED_ID, "Trashed")).resolves.toEqual([]);
  });

  it("updates note search visibility transactionally across create, edit, and delete", async () => {
    const note = await createMeetingNote({
      authorId: CREATOR_ID,
      authorName: "Creator",
      meetingId: WORKSPACE_MEETING_ID,
      note: { body: "Orchid launch risk", meetingTimeMs: 1000 },
      organizationId: ORGANIZATION_ID,
    });
    if (!note || note === "limit-exceeded") {
      throw new Error("expected note creation to stay within the projection budget");
    }

    await expect(searchAs(UNSELECTED_ID, "Orchid")).resolves.toMatchObject([
      { id: WORKSPACE_MEETING_ID, match: { kind: "note", startMs: 1000 } },
    ]);
    await updateMeetingNote({
      actorId: CREATOR_ID,
      canEditAll: true,
      canGovern: false,
      meetingId: WORKSPACE_MEETING_ID,
      note: { body: "Lotus launch risk" },
      noteId: note.id,
      organizationId: ORGANIZATION_ID,
    });
    await expect(searchAs(UNSELECTED_ID, "Orchid")).resolves.toEqual([]);
    await expect(searchAs(UNSELECTED_ID, "Lotus")).resolves.toHaveLength(1);
    await deleteMeetingNote({
      canGovern: false,
      meetingId: WORKSPACE_MEETING_ID,
      noteId: note.id,
      organizationId: ORGANIZATION_ID,
      userId: CREATOR_ID,
    });
    await expect(searchAs(UNSELECTED_ID, "Lotus")).resolves.toEqual([]);
  });

  it("serializes concurrent note projection rebuilds without losing either note", async () => {
    await Promise.all([
      createMeetingNote({
        authorId: CREATOR_ID,
        authorName: "Creator",
        meetingId: WORKSPACE_MEETING_ID,
        note: { body: "Concurrent Orchid", meetingTimeMs: 1000 },
        organizationId: ORGANIZATION_ID,
      }),
      createMeetingNote({
        authorId: CREATOR_ID,
        authorName: "Creator",
        meetingId: WORKSPACE_MEETING_ID,
        note: { body: "Concurrent Lotus", meetingTimeMs: 2000 },
        organizationId: ORGANIZATION_ID,
      }),
    ]);

    await expect(searchAs(UNSELECTED_ID, "Orchid")).resolves.toHaveLength(1);
    await expect(searchAs(UNSELECTED_ID, "Lotus")).resolves.toHaveLength(1);
  });

  it("rejects a note that would exceed the bounded projection source budget", async () => {
    await db.insert(meetingNote).values(
      Array.from({ length: 200 }, (_, index) => ({
        authorId: CREATOR_ID,
        authorName: "Creator",
        body: `Bounded note ${index}`,
        id: `meeting_search_note_${TEST_SUFFIX}_${index}`,
        meetingId: WORKSPACE_MEETING_ID,
        meetingTimeMs: index,
        organizationId: ORGANIZATION_ID,
      })),
    );

    await expect(
      createMeetingNote({
        authorId: CREATOR_ID,
        authorName: "Creator",
        meetingId: WORKSPACE_MEETING_ID,
        note: { body: "One note too many", meetingTimeMs: 1000 },
        organizationId: ORGANIZATION_ID,
      }),
    ).resolves.toBe("limit-exceeded");
  });

  it("treats SQL wildcard characters as literal search text", async () => {
    await expect(searchAs(UNSELECTED_ID, "%%")).resolves.toEqual([]);
  });
});
