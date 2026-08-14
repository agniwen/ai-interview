import { and, desc, eq, inArray, max } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  meetingAuditLog,
  meetingProcessingRun,
  meetingRecordingAsset,
  meetingSession,
  meetingTranscriptRevision,
  meetingTranscriptTurn,
  user,
} from "@arc/db-schema/schema";
import type {
  CreateMeetingTranscriptCorrectionInput,
  FinalMeetingTranscriptRevision,
  MeetingTranscriptRevisionSummary,
  MeetingTranscriptionProviderId,
} from "@arc/shared/meeting-transcription";
import { rebuildMeetingSearchProjection } from "../routes/search/dao";

const TRANSCRIPT_TURN_INSERT_BATCH_SIZE = 1000;

async function serializeTranscriptRevision(
  revision: typeof meetingTranscriptRevision.$inferSelect,
  turns: (typeof meetingTranscriptTurn.$inferSelect)[],
): Promise<FinalMeetingTranscriptRevision> {
  const creator = revision.createdBy
    ? await db.query.user.findFirst({
        columns: { id: true, name: true },
        where: { id: revision.createdBy },
      })
    : null;
  return {
    basedOnRevisionId: revision.basedOnRevisionId,
    createdAt: revision.createdAt.toISOString(),
    createdBy: creator ?? null,
    id: revision.id,
    kind: revision.kind as "final" | "human",
    language: revision.language,
    model: revision.model,
    provider: revision.provider as MeetingTranscriptionProviderId,
    region: revision.region,
    revision: revision.revision,
    turns: turns.map((turn) => ({
      confidence: turn.confidence,
      endMs: turn.endMs,
      id: turn.id,
      sequence: turn.sequence,
      speakerDisplayName: turn.speakerDisplayName,
      speakerKey: turn.speakerKey,
      startMs: turn.startMs,
      text: turn.text,
      track: turn.track as "local" | "remote",
    })),
  };
}

export async function loadActiveMeetingTranscript(input: {
  meetingId: string;
  organizationId: string;
}): Promise<FinalMeetingTranscriptRevision | null> {
  const meeting = await db.query.meetingSession.findFirst({
    columns: { activeTranscriptRevisionId: true },
    where: { id: input.meetingId, organizationId: input.organizationId },
  });
  if (!meeting?.activeTranscriptRevisionId) {
    return null;
  }
  const revision = await db.query.meetingTranscriptRevision.findFirst({
    where: {
      id: meeting.activeTranscriptRevisionId,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    },
    with: { turns: { orderBy: { sequence: "asc" } } },
  });
  return revision ? serializeTranscriptRevision(revision, revision.turns) : null;
}

export async function createHumanMeetingTranscriptRevision(input: {
  actorId: string;
  correction: CreateMeetingTranscriptCorrectionInput;
  meetingId: string;
  organizationId: string;
}): Promise<FinalMeetingTranscriptRevision | "conflict" | "invalid-range" | "not-found"> {
  const result = await db.transaction(async (tx) => {
    const [meeting] = await tx
      .select({
        activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
        intelligenceRunId: meetingSession.intelligenceRunId,
      })
      .from(meetingSession)
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
        ),
      )
      .for("update");
    if (!meeting) {
      return "not-found" as const;
    }
    if (meeting.activeTranscriptRevisionId !== input.correction.sourceRevisionId) {
      return "conflict" as const;
    }
    const [source] = await tx
      .select()
      .from(meetingTranscriptRevision)
      .where(
        and(
          eq(meetingTranscriptRevision.id, input.correction.sourceRevisionId),
          eq(meetingTranscriptRevision.meetingId, input.meetingId),
          eq(meetingTranscriptRevision.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!source) {
      return "conflict" as const;
    }
    const sourceTurns = await tx
      .select({
        speakerDisplayName: meetingTranscriptTurn.speakerDisplayName,
        speakerKey: meetingTranscriptTurn.speakerKey,
      })
      .from(meetingTranscriptTurn)
      .where(eq(meetingTranscriptTurn.revisionId, source.id));
    const sourceSpeakerDisplayNames = new Map(
      sourceTurns.map((turn) => [turn.speakerKey, turn.speakerDisplayName]),
    );
    const renamedSpeakerKeys = [
      ...new Set(
        input.correction.turns.flatMap((turn) =>
          sourceSpeakerDisplayNames.get(turn.speakerKey) === turn.speakerDisplayName
            ? []
            : [turn.speakerKey],
        ),
      ),
    ];
    const [duration] = await tx
      .select({ durationMs: max(meetingRecordingAsset.durationMs) })
      .from(meetingRecordingAsset)
      .where(
        and(
          eq(meetingRecordingAsset.meetingId, input.meetingId),
          inArray(meetingRecordingAsset.track, ["microphone", "system"]),
        ),
      );
    const durationMs = Number(duration?.durationMs ?? 0);
    if (input.correction.turns.some((turn) => turn.endMs > durationMs)) {
      return "invalid-range" as const;
    }
    const [latest] = await tx
      .select({ revision: max(meetingTranscriptRevision.revision) })
      .from(meetingTranscriptRevision)
      .where(eq(meetingTranscriptRevision.meetingId, input.meetingId));
    const revisionId = crypto.randomUUID();
    const [revision] = await tx
      .insert(meetingTranscriptRevision)
      .values({
        basedOnRevisionId: source.id,
        createdBy: input.actorId,
        id: revisionId,
        kind: "human",
        language: input.correction.language,
        meetingId: input.meetingId,
        model: source.model,
        organizationId: input.organizationId,
        pipelineVersion: source.pipelineVersion,
        processingRunId: null,
        provider: source.provider,
        region: source.region,
        revision: Number(latest?.revision ?? 0) + 1,
        sourceManifestSha256: source.sourceManifestSha256,
      })
      .returning();
    if (!revision) {
      throw new Error("创建人工修订失败");
    }
    const turns = input.correction.turns.map((turn, sequence) => ({
      ...turn,
      id: crypto.randomUUID(),
      revisionId,
      sequence,
    }));
    if (turns.length > 0) {
      for (let offset = 0; offset < turns.length; offset += TRANSCRIPT_TURN_INSERT_BATCH_SIZE) {
        await tx
          .insert(meetingTranscriptTurn)
          .values(turns.slice(offset, offset + TRANSCRIPT_TURN_INSERT_BATCH_SIZE));
      }
    }
    if (meeting.intelligenceRunId) {
      await tx
        .update(meetingProcessingRun)
        .set({
          errorCode: "superseded",
          errorMessage: "Authoritative transcript was corrected",
          executionToken: null,
          finishedAt: new Date(),
          status: "failed",
        })
        .where(
          and(
            eq(meetingProcessingRun.id, meeting.intelligenceRunId),
            inArray(meetingProcessingRun.status, ["pending", "processing"]),
          ),
        );
    }
    await tx
      .update(meetingSession)
      .set({
        activeTranscriptRevisionId: revisionId,
        intelligenceError: null,
        intelligenceRunId: null,
        intelligenceStatus: "pending",
      })
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
        ),
      );
    await tx.insert(meetingAuditLog).values({
      action: "meeting.transcript_corrected",
      actorId: input.actorId,
      detail: { renamedSpeakerKeys, revisionId, sourceRevisionId: source.id },
      id: crypto.randomUUID(),
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
    await rebuildMeetingSearchProjection(tx, input);
    return { revision, turns };
  });
  return typeof result === "string"
    ? result
    : serializeTranscriptRevision(result.revision, result.turns);
}

export async function listMeetingTranscriptRevisions(input: {
  meetingId: string;
  organizationId: string;
}): Promise<MeetingTranscriptRevisionSummary[]> {
  const rows = await db
    .select({
      basedOnRevisionId: meetingTranscriptRevision.basedOnRevisionId,
      createdAt: meetingTranscriptRevision.createdAt,
      createdById: meetingTranscriptRevision.createdBy,
      createdByName: user.name,
      id: meetingTranscriptRevision.id,
      kind: meetingTranscriptRevision.kind,
      language: meetingTranscriptRevision.language,
      model: meetingTranscriptRevision.model,
      provider: meetingTranscriptRevision.provider,
      region: meetingTranscriptRevision.region,
      revision: meetingTranscriptRevision.revision,
    })
    .from(meetingTranscriptRevision)
    .leftJoin(user, eq(user.id, meetingTranscriptRevision.createdBy))
    .where(
      and(
        eq(meetingTranscriptRevision.meetingId, input.meetingId),
        eq(meetingTranscriptRevision.organizationId, input.organizationId),
      ),
    )
    .orderBy(desc(meetingTranscriptRevision.revision));
  return rows.map((row) => ({
    basedOnRevisionId: row.basedOnRevisionId,
    createdAt: row.createdAt.toISOString(),
    createdBy:
      row.createdById && row.createdByName
        ? { id: row.createdById, name: row.createdByName }
        : null,
    id: row.id,
    kind: row.kind as "final" | "human",
    language: row.language,
    model: row.model,
    provider: row.provider as MeetingTranscriptionProviderId,
    region: row.region,
    revision: row.revision,
  }));
}

export async function loadMeetingTranscriptRevision(input: {
  meetingId: string;
  organizationId: string;
  revisionId: string;
}): Promise<FinalMeetingTranscriptRevision | null> {
  const revision = await db.query.meetingTranscriptRevision.findFirst({
    where: {
      id: input.revisionId,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    },
    with: { turns: { orderBy: { sequence: "asc" } } },
  });
  return revision ? serializeTranscriptRevision(revision, revision.turns) : null;
}
