import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@server/lib/server/db/index";
import {
  meetingSession,
  meetingTranscriptRevision,
  meetingTranscriptTurn,
  member,
} from "@app/db-schema/schema";
import { isWorkspaceAdministrator } from "../../access";

export type MeetingExportContext =
  | { kind: "forbidden" | "not-found" }
  | {
      activeIntelligenceRevisionId: string | null;
      intelligence: {
        content: unknown;
        createdAt: Date;
        id: string;
        revision: number;
        templateKey: string;
        transcriptRevisionId: string;
      } | null;
      kind: "authorized";
      meeting: {
        id: string;
        savedAt: Date;
        startedAt: Date;
        title: string;
      };
      recordingAssets: {
        contentType: string;
        storageKey: string;
        track: string;
      }[];
      transcript: {
        createdAt: Date;
        id: string;
        kind: string;
        language: string | null;
        revision: number;
      } | null;
    };

export function loadMeetingExportContext(input: {
  meetingId: string;
  organizationId: string;
  userId: string;
}): Promise<MeetingExportContext> {
  return db.transaction(async (tx) => {
    const [meeting] = await tx
      .select({
        activeIntelligenceRevisionId: meetingSession.activeIntelligenceRevisionId,
        activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
        custodianId: meetingSession.custodianId,
        id: meetingSession.id,
        ownerId: meetingSession.ownerId,
        savedAt: meetingSession.savedAt,
        startedAt: meetingSession.startedAt,
        status: meetingSession.status,
        title: meetingSession.title,
        visibility: meetingSession.visibility,
      })
      .from(meetingSession)
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
        ),
      )
      .for("share");
    if (!meeting || meeting.status === "trashed" || meeting.status === "purging") {
      return { kind: "not-found" };
    }
    const [membership] = await tx
      .select({ id: member.id, role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)))
      .for("share");
    if (!membership || membership.role === "noAccess") {
      return { kind: "not-found" };
    }
    const administrator = isWorkspaceAdministrator(membership.role);
    const owner = (meeting.custodianId ?? meeting.ownerId) === input.userId;
    if (!(administrator || owner)) {
      if (meeting.visibility === "workspace") {
        return { kind: "forbidden" };
      }
      const grant = await tx.query.meetingAccessGrant.findFirst({
        columns: { id: true },
        where: {
          meetingId: input.meetingId,
          memberId: membership.id,
          organizationId: input.organizationId,
        },
      });
      return { kind: grant ? "forbidden" : "not-found" };
    }
    const transcript = meeting.activeTranscriptRevisionId
      ? await tx.query.meetingTranscriptRevision.findFirst({
          columns: {
            createdAt: true,
            id: true,
            kind: true,
            language: true,
            revision: true,
          },
          where: {
            id: meeting.activeTranscriptRevisionId,
            meetingId: input.meetingId,
            organizationId: input.organizationId,
          },
        })
      : null;
    const intelligence =
      meeting.activeIntelligenceRevisionId && transcript
        ? await tx.query.meetingIntelligenceRevision.findFirst({
            columns: {
              content: true,
              createdAt: true,
              id: true,
              revision: true,
              templateKey: true,
              transcriptRevisionId: true,
            },
            where: {
              id: meeting.activeIntelligenceRevisionId,
              meetingId: input.meetingId,
              organizationId: input.organizationId,
              transcriptRevisionId: transcript.id,
            },
          })
        : null;
    const recordingAssets = await tx.query.meetingRecordingAsset.findMany({
      columns: { contentType: true, storageKey: true, track: true },
      where: {
        meetingId: input.meetingId,
        status: "ready",
        track: { in: ["playback", "microphone", "system"] },
        verifiedAt: { isNotNull: true },
      },
    });
    return {
      activeIntelligenceRevisionId: meeting.activeIntelligenceRevisionId,
      intelligence: intelligence ?? null,
      kind: "authorized",
      meeting: {
        id: meeting.id,
        savedAt: meeting.savedAt,
        startedAt: meeting.startedAt,
        title: meeting.title,
      },
      recordingAssets,
      transcript: transcript ?? null,
    };
  });
}

export function loadMeetingExportTurnsPage(input: {
  afterSequence: number;
  expectedIntelligenceRevisionId: string | null;
  limit: number;
  meetingId: string;
  organizationId: string;
  revisionId: string;
  userId: string;
}) {
  return db.transaction(async (tx) => {
    const [meeting] = await tx
      .select({
        activeIntelligenceRevisionId: meetingSession.activeIntelligenceRevisionId,
        activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
        custodianId: meetingSession.custodianId,
        ownerId: meetingSession.ownerId,
        status: meetingSession.status,
      })
      .from(meetingSession)
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
        ),
      )
      .for("share");
    if (
      !meeting ||
      meeting.status === "trashed" ||
      meeting.status === "purging" ||
      meeting.activeTranscriptRevisionId !== input.revisionId ||
      meeting.activeIntelligenceRevisionId !== input.expectedIntelligenceRevisionId
    ) {
      return { kind: "revoked" as const };
    }
    const [membership] = await tx
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)))
      .for("share");
    const allowed =
      membership &&
      membership.role !== "noAccess" &&
      (isWorkspaceAdministrator(membership.role) ||
        (meeting.custodianId ?? meeting.ownerId) === input.userId);
    if (!allowed) {
      return { kind: "revoked" as const };
    }
    const turns = await tx
      .select({
        endMs: meetingTranscriptTurn.endMs,
        id: meetingTranscriptTurn.id,
        sequence: meetingTranscriptTurn.sequence,
        speakerDisplayName: meetingTranscriptTurn.speakerDisplayName,
        startMs: meetingTranscriptTurn.startMs,
        text: meetingTranscriptTurn.text,
        track: meetingTranscriptTurn.track,
      })
      .from(meetingTranscriptTurn)
      .innerJoin(
        meetingTranscriptRevision,
        eq(meetingTranscriptRevision.id, meetingTranscriptTurn.revisionId),
      )
      .where(
        and(
          eq(meetingTranscriptTurn.revisionId, input.revisionId),
          gt(meetingTranscriptTurn.sequence, input.afterSequence),
        ),
      )
      .orderBy(asc(meetingTranscriptTurn.sequence))
      .limit(input.limit);
    return { kind: "authorized" as const, turns };
  });
}
