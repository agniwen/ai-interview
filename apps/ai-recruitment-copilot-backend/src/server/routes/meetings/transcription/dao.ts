/* oxlint-disable max-lines -- transcription claims, checkpoints, and publication share transactional invariants. */
import { and, desc, eq, inArray, isNotNull, max, ne, sql } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  meetingAuditLog,
  meetingProcessingRun,
  meetingSession,
  meetingTranscriptRevision,
  meetingTranscriptTurn,
  meetingTranscriptionChunk,
  meetingTranscriptionPolicy,
  member,
} from "@arc/db-schema/schema";
import { MEETING_TRANSCRIPTION_PIPELINE_VERSION } from "@arc/meeting-processing-queue/meeting-transcription";
import type { MeetingTranscriptionJobData } from "@arc/meeting-processing-queue/meeting-transcription";
import type {
  CanonicalMeetingTranscript,
  MeetingTranscriptionProviderId,
  UpdateMeetingTranscriptionPolicyInput,
} from "@arc/shared/meeting-transcription";
import { rebuildMeetingSearchProjection } from "../routes/search/dao";
import { isWorkspaceAdministrator } from "../access";
import { canonicalMeetingTranscriptSchema } from "@arc/shared/meeting-transcription";
import type { FinalTranscriptionAudioChunk } from "./provider";
import { findMeetingTranscriptionProviderCandidate } from "./provider-registry";

const PUBLIC_TRANSCRIPTION_FAILURE_MESSAGE = "最终会议转录失败，请稍后重试。";
const PUBLIC_TRANSCRIPTION_QUOTA_MESSAGE =
  "最终会议转录因 provider 配额不足失败，录音已保留，请稍后重试。";

function publicTranscriptionFailure(errorCode: "provider-error" | "provider-quota"): string {
  return errorCode === "provider-quota"
    ? PUBLIC_TRANSCRIPTION_QUOTA_MESSAGE
    : PUBLIC_TRANSCRIPTION_FAILURE_MESSAGE;
}

function policyAllows(
  policy: typeof meetingTranscriptionPolicy.$inferSelect | null | undefined,
  provider: MeetingTranscriptionProviderId,
): boolean {
  return Boolean(
    policy &&
    [policy.selectedProvider, policy.fallbackProvider].includes(provider) &&
    policy.allowedProviders.includes(provider),
  );
}

export async function loadMeetingTranscriptionPolicy(organizationId: string): Promise<{
  allowedProviders: MeetingTranscriptionProviderId[];
  fallbackProvider: MeetingTranscriptionProviderId | null;
  revision: number;
  selectionReason: string | null;
  selectedProvider: MeetingTranscriptionProviderId | null;
}> {
  const row = await db.query.meetingTranscriptionPolicy.findFirst({ where: { organizationId } });
  return row
    ? {
        allowedProviders: row.allowedProviders as MeetingTranscriptionProviderId[],
        fallbackProvider: row.fallbackProvider as MeetingTranscriptionProviderId | null,
        revision: row.revision,
        selectedProvider: row.selectedProvider as MeetingTranscriptionProviderId | null,
        selectionReason: row.selectionReason,
      }
    : {
        allowedProviders: [],
        fallbackProvider: null,
        revision: 0,
        selectedProvider: null,
        selectionReason: null,
      };
}

export async function updateMeetingTranscriptionPolicy(input: {
  actorId: string;
  organizationId: string;
  policy: UpdateMeetingTranscriptionPolicyInput;
}): Promise<{
  allowedProviders: MeetingTranscriptionProviderId[];
  fallbackProvider: MeetingTranscriptionProviderId | null;
  revision: number;
  selectionReason: string | null;
  selectedProvider: MeetingTranscriptionProviderId | null;
} | null> {
  return await db.transaction(async (tx) => {
    const [activeMembership] = await tx
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.actorId)))
      .for("share");
    if (!activeMembership || !isWorkspaceAdministrator(activeMembership.role)) {
      return null;
    }
    const [row] = await tx
      .insert(meetingTranscriptionPolicy)
      .values({
        allowedProviders: input.policy.allowedProviders,
        fallbackProvider: input.policy.fallbackProvider,
        organizationId: input.organizationId,
        selectedProvider: input.policy.selectedProvider,
        selectionReason: input.policy.selectionReason,
        updatedBy: input.actorId,
      })
      .onConflictDoUpdate({
        set: {
          allowedProviders: input.policy.allowedProviders,
          fallbackProvider: input.policy.fallbackProvider,
          revision: sql`${meetingTranscriptionPolicy.revision} + 1`,
          selectedProvider: input.policy.selectedProvider,
          selectionReason: input.policy.selectionReason,
          updatedAt: new Date(),
          updatedBy: input.actorId,
        },
        target: meetingTranscriptionPolicy.organizationId,
      })
      .returning();
    if (!row) {
      throw new Error("更新 Meeting transcription policy 失败");
    }
    const activeRuns = await tx
      .select({ id: meetingSession.transcriptionRunId })
      .from(meetingSession)
      .where(
        and(
          eq(meetingSession.organizationId, input.organizationId),
          eq(meetingSession.transcriptionStatus, "processing"),
          isNotNull(meetingSession.transcriptionRunId),
        ),
      )
      .for("update");
    const activeRunIds = activeRuns.flatMap((run) => (run.id ? [run.id] : []));
    await tx
      .update(meetingSession)
      .set({
        transcriptionError: null,
        transcriptionRunId: null,
        transcriptionStatus: "pending",
      })
      .where(
        and(
          eq(meetingSession.organizationId, input.organizationId),
          eq(meetingSession.transcriptionStatus, "processing"),
        ),
      );
    if (activeRunIds.length > 0) {
      await tx
        .update(meetingProcessingRun)
        .set({
          errorCode: "policy-changed",
          errorMessage: "Transcription provider policy changed during processing",
          finishedAt: new Date(),
          status: "failed",
        })
        .where(inArray(meetingProcessingRun.id, activeRunIds));
    }
    await tx.insert(meetingAuditLog).values({
      action: "meeting.transcription_policy_updated",
      actorId: input.actorId,
      detail: input.policy,
      id: crypto.randomUUID(),
      organizationId: input.organizationId,
    });
    return {
      allowedProviders: row.allowedProviders as MeetingTranscriptionProviderId[],
      fallbackProvider: row.fallbackProvider as MeetingTranscriptionProviderId | null,
      revision: row.revision,
      selectedProvider: row.selectedProvider as MeetingTranscriptionProviderId | null,
      selectionReason: row.selectionReason,
    };
  });
}

function sourceAssetsReady(assets: { status: string; track: string }[]): boolean {
  return ["microphone", "system"].every((track) =>
    assets.some((asset) => asset.track === track && asset.status === "ready"),
  );
}

export const DEFAULT_MEETING_TRANSCRIPTION_PROVIDER = "qwen" as const;
export const DEFAULT_MEETING_TRANSCRIPTION_POLICY_REASON = "未配置转录策略时默认使用百炼 Qwen ASR";

/**
 * 工作区尚未配置转录策略时，幂等物化一行默认使用 Qwen ASR 的策略。
 * 仅当部署里启用了 qwen 候选才写入；并发写入靠 organizationId 主键去重。
 * Materialize the default Qwen ASR policy when a workspace has none configured.
 */
export async function ensureDefaultMeetingTranscriptionPolicy(
  organizationId: string,
): Promise<typeof meetingTranscriptionPolicy.$inferSelect | null> {
  if (!findMeetingTranscriptionProviderCandidate(DEFAULT_MEETING_TRANSCRIPTION_PROVIDER)) {
    return null;
  }
  await db
    .insert(meetingTranscriptionPolicy)
    .values({
      allowedProviders: [DEFAULT_MEETING_TRANSCRIPTION_PROVIDER],
      organizationId,
      selectedProvider: DEFAULT_MEETING_TRANSCRIPTION_PROVIDER,
      selectionReason: DEFAULT_MEETING_TRANSCRIPTION_POLICY_REASON,
    })
    .onConflictDoNothing({ target: meetingTranscriptionPolicy.organizationId });
  return (
    (await db.query.meetingTranscriptionPolicy.findFirst({
      where: { organizationId },
    })) ?? null
  );
}

export async function getMeetingTranscriptionJobForMeeting(input: {
  meetingId: string;
  organizationId: string;
  preferFallback?: boolean;
}): Promise<MeetingTranscriptionJobData | null> {
  const meeting = await db.query.meetingSession.findFirst({
    where: {
      id: input.meetingId,
      organizationId: input.organizationId,
      status: "ready",
      transcriptionStatus: { in: ["pending", "processing"] },
    },
    with: { assets: true },
  });
  let policy: typeof meetingTranscriptionPolicy.$inferSelect | null | undefined =
    await db.query.meetingTranscriptionPolicy.findFirst({
      where: { organizationId: input.organizationId },
    });
  if (!policy) {
    policy = await ensureDefaultMeetingTranscriptionPolicy(input.organizationId);
  }
  const provider = (
    input.preferFallback && policy?.fallbackProvider
      ? policy.fallbackProvider
      : policy?.selectedProvider
  ) as MeetingTranscriptionProviderId | null | undefined;
  if (
    !(
      meeting &&
      policy &&
      provider &&
      policyAllows(policy, provider) &&
      sourceAssetsReady(meeting.assets)
    )
  ) {
    return null;
  }
  const candidate = findMeetingTranscriptionProviderCandidate(provider);
  if (!candidate) {
    return null;
  }
  return {
    meetingId: meeting.id,
    model: candidate.model,
    organizationId: meeting.organizationId,
    pipelineVersion: MEETING_TRANSCRIPTION_PIPELINE_VERSION,
    policyRevision: policy.revision,
    provider,
    region: candidate.region,
    sourceManifestSha256: meeting.manifestSha256,
  };
}

export async function listRecoverableMeetingTranscriptionJobs(): Promise<
  MeetingTranscriptionJobData[]
> {
  const meetings = await db.query.meetingSession.findMany({
    where: { status: "ready", transcriptionStatus: { in: ["pending", "processing"] } },
    with: { assets: true },
  });
  const organizationIds = [...new Set(meetings.map((meeting) => meeting.organizationId))];
  if (organizationIds.length === 0) {
    return [];
  }
  const policies = await db
    .select()
    .from(meetingTranscriptionPolicy)
    .where(inArray(meetingTranscriptionPolicy.organizationId, organizationIds));
  const policyByOrganization = new Map(policies.map((policy) => [policy.organizationId, policy]));
  // 尚未配置策略的工作区默认使用 Qwen ASR，幂等物化后再生成 job。
  for (const organizationId of organizationIds) {
    if (policyByOrganization.has(organizationId)) {
      continue;
    }
    const ensured = await ensureDefaultMeetingTranscriptionPolicy(organizationId);
    if (ensured) {
      policyByOrganization.set(organizationId, ensured);
    }
  }
  const jobs: MeetingTranscriptionJobData[] = [];
  for (const meeting of meetings) {
    const policy = policyByOrganization.get(meeting.organizationId);
    const provider = policy?.selectedProvider as MeetingTranscriptionProviderId | null | undefined;
    if (
      !(policy && provider && policyAllows(policy, provider) && sourceAssetsReady(meeting.assets))
    ) {
      continue;
    }
    const candidate = findMeetingTranscriptionProviderCandidate(provider);
    if (!candidate) {
      continue;
    }
    jobs.push({
      meetingId: meeting.id,
      model: candidate.model,
      organizationId: meeting.organizationId,
      pipelineVersion: MEETING_TRANSCRIPTION_PIPELINE_VERSION,
      policyRevision: policy.revision,
      provider,
      region: candidate.region,
      sourceManifestSha256: meeting.manifestSha256,
    });
  }
  return jobs;
}

export function loadMeetingTranscriptionSource(input: MeetingTranscriptionJobData) {
  return db.query.meetingSession.findFirst({
    where: {
      id: input.meetingId,
      organizationId: input.organizationId,
      status: "ready",
    },
    with: { assets: true },
  });
}

function chunkCheckpointWhere(
  input: MeetingTranscriptionJobData,
  chunk: FinalTranscriptionAudioChunk,
) {
  return and(
    eq(meetingTranscriptionChunk.meetingId, input.meetingId),
    eq(meetingTranscriptionChunk.sourceManifestSha256, input.sourceManifestSha256),
    eq(meetingTranscriptionChunk.policyRevision, input.policyRevision),
    eq(meetingTranscriptionChunk.provider, input.provider),
    eq(meetingTranscriptionChunk.model, input.model),
    eq(meetingTranscriptionChunk.region, input.region),
    eq(meetingTranscriptionChunk.pipelineVersion, input.pipelineVersion),
    eq(meetingTranscriptionChunk.track, chunk.track),
    eq(meetingTranscriptionChunk.chunkIndex, chunk.index),
    eq(meetingTranscriptionChunk.startMs, chunk.startMs),
    eq(meetingTranscriptionChunk.endMs, chunk.endMs),
  );
}

export async function loadMeetingTranscriptionChunkCheckpoint(
  input: MeetingTranscriptionJobData,
  chunk: FinalTranscriptionAudioChunk,
): Promise<CanonicalMeetingTranscript | null> {
  const [row] = await db
    .select({
      status: meetingTranscriptionChunk.status,
      transcript: meetingTranscriptionChunk.transcript,
    })
    .from(meetingTranscriptionChunk)
    .where(chunkCheckpointWhere(input, chunk))
    .limit(1);
  return row?.status === "succeeded"
    ? canonicalMeetingTranscriptSchema.parse(row.transcript)
    : null;
}

export type MeetingTranscriptionChunkClaim =
  | { status: "busy" | "claimed" | "not-current" }
  | { status: "ready"; transcript: CanonicalMeetingTranscript };

export async function claimMeetingTranscriptionChunk(
  input: MeetingTranscriptionJobData & { processingRunId: string },
  chunk: FinalTranscriptionAudioChunk,
): Promise<MeetingTranscriptionChunkClaim> {
  return await db.transaction(async (tx) => {
    const [policy] = await tx
      .select()
      .from(meetingTranscriptionPolicy)
      .where(
        and(
          eq(meetingTranscriptionPolicy.organizationId, input.organizationId),
          eq(meetingTranscriptionPolicy.revision, input.policyRevision),
        ),
      )
      .for("share")
      .limit(1);
    if (!policyAllows(policy, input.provider)) {
      return { status: "not-current" };
    }
    const [meeting] = await tx
      .select({
        status: meetingSession.status,
        transcriptionRunId: meetingSession.transcriptionRunId,
      })
      .from(meetingSession)
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
        ),
      )
      .for("update")
      .limit(1);
    if (meeting?.status !== "ready" || meeting.transcriptionRunId !== input.processingRunId) {
      return { status: "not-current" };
    }
    const [inserted] = await tx
      .insert(meetingTranscriptionChunk)
      .values({
        chunkIndex: chunk.index,
        endMs: chunk.endMs,
        id: crypto.randomUUID(),
        meetingId: input.meetingId,
        model: input.model,
        organizationId: input.organizationId,
        pipelineVersion: input.pipelineVersion,
        policyRevision: input.policyRevision,
        processingRunId: input.processingRunId,
        provider: input.provider,
        region: input.region,
        sourceManifestSha256: input.sourceManifestSha256,
        startMs: chunk.startMs,
        status: "processing",
        track: chunk.track,
        transcript: null,
      })
      .onConflictDoNothing()
      .returning({ id: meetingTranscriptionChunk.id });
    if (inserted) {
      return { status: "claimed" };
    }
    const [existing] = await tx
      .select({
        id: meetingTranscriptionChunk.id,
        status: meetingTranscriptionChunk.status,
        transcript: meetingTranscriptionChunk.transcript,
      })
      .from(meetingTranscriptionChunk)
      .where(chunkCheckpointWhere(input, chunk))
      .for("update")
      .limit(1);
    if (!existing) {
      return { status: "busy" };
    }
    if (existing.status === "succeeded") {
      return {
        status: "ready",
        transcript: canonicalMeetingTranscriptSchema.parse(existing.transcript),
      };
    }
    if (existing.status === "failed") {
      await tx
        .update(meetingTranscriptionChunk)
        .set({
          processingRunId: input.processingRunId,
          status: "processing",
          transcript: null,
          updatedAt: new Date(),
        })
        .where(eq(meetingTranscriptionChunk.id, existing.id));
      return { status: "claimed" };
    }
    const claimedByCurrentRun = await tx
      .update(meetingTranscriptionChunk)
      .set({ processingRunId: input.processingRunId, updatedAt: new Date() })
      .where(
        and(
          eq(meetingTranscriptionChunk.id, existing.id),
          ne(meetingTranscriptionChunk.processingRunId, input.processingRunId),
        ),
      )
      .returning({ id: meetingTranscriptionChunk.id });
    if (claimedByCurrentRun.length > 0) {
      return { status: "claimed" };
    }
    return { status: "busy" };
  });
}

export async function saveMeetingTranscriptionChunkCheckpoint(
  input: MeetingTranscriptionJobData & { processingRunId: string },
  chunk: FinalTranscriptionAudioChunk,
  transcript: CanonicalMeetingTranscript,
): Promise<CanonicalMeetingTranscript> {
  await db
    .update(meetingTranscriptionChunk)
    .set({ status: "succeeded", transcript, updatedAt: new Date() })
    .where(
      and(
        chunkCheckpointWhere(input, chunk),
        eq(meetingTranscriptionChunk.status, "processing"),
        eq(meetingTranscriptionChunk.processingRunId, input.processingRunId),
      ),
    );
  const saved = await loadMeetingTranscriptionChunkCheckpoint(input, chunk);
  if (!saved) {
    throw new Error("Meeting transcription chunk checkpoint 写入失败");
  }
  return saved;
}

export async function markMeetingTranscriptionChunkFailed(
  input: MeetingTranscriptionJobData & { processingRunId: string },
  chunk: FinalTranscriptionAudioChunk,
) {
  await db
    .update(meetingTranscriptionChunk)
    .set({ status: "failed", transcript: null, updatedAt: new Date() })
    .where(
      and(
        chunkCheckpointWhere(input, chunk),
        eq(meetingTranscriptionChunk.status, "processing"),
        eq(meetingTranscriptionChunk.processingRunId, input.processingRunId),
      ),
    );
}

function machineRevisionWhere(input: MeetingTranscriptionJobData) {
  return and(
    eq(meetingTranscriptRevision.meetingId, input.meetingId),
    eq(meetingTranscriptRevision.kind, "final"),
    eq(meetingTranscriptRevision.sourceManifestSha256, input.sourceManifestSha256),
    eq(meetingTranscriptRevision.provider, input.provider),
    eq(meetingTranscriptRevision.model, input.model),
    eq(meetingTranscriptRevision.region, input.region),
    eq(meetingTranscriptRevision.pipelineVersion, input.pipelineVersion),
  );
}

export async function claimMeetingTranscriptionRun(
  input: MeetingTranscriptionJobData & { attempt: number; processingRunId: string },
): Promise<"already-ready" | "claimed" | "not-eligible"> {
  return await db.transaction(async (tx) => {
    const [policy] = await tx
      .select()
      .from(meetingTranscriptionPolicy)
      .where(
        and(
          eq(meetingTranscriptionPolicy.organizationId, input.organizationId),
          eq(meetingTranscriptionPolicy.revision, input.policyRevision),
        ),
      )
      .for("share")
      .limit(1);
    if (!policyAllows(policy, input.provider)) {
      return "not-eligible";
    }
    const [meeting] = await tx
      .select({
        activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
        manifestSha256: meetingSession.manifestSha256,
        transcriptionRunId: meetingSession.transcriptionRunId,
      })
      .from(meetingSession)
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
          eq(meetingSession.status, "ready"),
        ),
      )
      .for("update")
      .limit(1);
    if (!meeting || meeting.manifestSha256 !== input.sourceManifestSha256) {
      return "not-eligible";
    }
    const [existing] = await tx
      .select({ id: meetingTranscriptRevision.id })
      .from(meetingTranscriptRevision)
      .where(machineRevisionWhere(input))
      .limit(1);
    if (existing) {
      await tx
        .update(meetingSession)
        .set({
          activeTranscriptRevisionId: meeting.activeTranscriptRevisionId ?? existing.id,
          transcriptionError: null,
          transcriptionRunId: null,
          transcriptionStatus: "ready",
        })
        .where(eq(meetingSession.id, input.meetingId));
      if (meeting.transcriptionRunId) {
        await tx
          .update(meetingProcessingRun)
          .set({ finishedAt: new Date(), status: "succeeded" })
          .where(eq(meetingProcessingRun.id, meeting.transcriptionRunId));
      }
      return "already-ready";
    }
    if (meeting.transcriptionRunId && meeting.transcriptionRunId !== input.processingRunId) {
      await tx
        .update(meetingProcessingRun)
        .set({
          errorCode: "superseded",
          errorMessage: "Processing run was superseded by a later delivery",
          finishedAt: new Date(),
          status: "failed",
        })
        .where(eq(meetingProcessingRun.id, meeting.transcriptionRunId));
    }
    await tx.insert(meetingProcessingRun).values({
      attempt: input.attempt,
      id: input.processingRunId,
      idempotencyKey: [
        input.meetingId,
        input.sourceManifestSha256,
        input.policyRevision,
        input.provider,
        input.model,
        input.region,
        input.pipelineVersion,
        input.attempt,
        input.processingRunId,
      ].join(":"),
      meetingId: input.meetingId,
      model: input.model,
      organizationId: input.organizationId,
      pipelineVersion: input.pipelineVersion,
      provider: input.provider,
      region: input.region,
      stage: "final-transcription",
      status: "processing",
    });
    await tx
      .update(meetingSession)
      .set({
        transcriptionError: null,
        transcriptionRunId: input.processingRunId,
        transcriptionStatus: "processing",
      })
      .where(eq(meetingSession.id, input.meetingId));
    return "claimed";
  });
}

export async function markMeetingTranscriptionFailed(
  input: MeetingTranscriptionJobData & {
    errorCode: "provider-error" | "provider-quota";
    errorMessage: string;
    processingRunId: string;
    terminal: boolean;
  },
): Promise<boolean> {
  return await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(meetingSession)
      .set({
        transcriptionError: input.terminal ? publicTranscriptionFailure(input.errorCode) : null,
        transcriptionRunId: null,
        transcriptionStatus: input.terminal ? "failed" : "processing",
      })
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
          eq(meetingSession.transcriptionRunId, input.processingRunId),
        ),
      )
      .returning({ id: meetingSession.id });
    if (!updated) {
      return false;
    }
    await tx
      .update(meetingProcessingRun)
      .set({
        errorCode: input.errorCode,
        errorMessage: input.errorMessage.slice(0, 1000),
        finishedAt: new Date(),
        status: "failed",
      })
      .where(
        and(
          eq(meetingProcessingRun.id, input.processingRunId),
          eq(meetingProcessingRun.status, "processing"),
        ),
      );
    return true;
  });
}

export async function publishMeetingTranscript(
  input: MeetingTranscriptionJobData & {
    processingRunId: string;
    transcript: CanonicalMeetingTranscript;
  },
): Promise<boolean> {
  return await db.transaction(async (tx) => {
    const [policy] = await tx
      .select()
      .from(meetingTranscriptionPolicy)
      .where(
        and(
          eq(meetingTranscriptionPolicy.organizationId, input.organizationId),
          eq(meetingTranscriptionPolicy.revision, input.policyRevision),
        ),
      )
      .for("share")
      .limit(1);
    if (!policyAllows(policy, input.provider)) {
      return false;
    }
    const [meeting] = await tx
      .select({
        status: meetingSession.status,
        title: meetingSession.title,
        transcriptionRunId: meetingSession.transcriptionRunId,
      })
      .from(meetingSession)
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
        ),
      )
      .for("update")
      .limit(1);
    if (meeting?.status !== "ready" || meeting.transcriptionRunId !== input.processingRunId) {
      return false;
    }
    const [existing] = await tx
      .select({ id: meetingTranscriptRevision.id })
      .from(meetingTranscriptRevision)
      .where(machineRevisionWhere(input))
      .limit(1);
    let revisionId = existing?.id;
    if (!revisionId) {
      const [latest] = await tx
        .select({ revision: max(meetingTranscriptRevision.revision) })
        .from(meetingTranscriptRevision)
        .where(eq(meetingTranscriptRevision.meetingId, input.meetingId));
      revisionId = crypto.randomUUID();
      await tx.insert(meetingTranscriptRevision).values({
        id: revisionId,
        kind: "final",
        language: input.transcript.language,
        meetingId: input.meetingId,
        model: input.model,
        organizationId: input.organizationId,
        pipelineVersion: input.pipelineVersion,
        processingRunId: input.processingRunId,
        provider: input.provider,
        region: input.region,
        revision: Number(latest?.revision ?? 0) + 1,
        sourceManifestSha256: input.sourceManifestSha256,
      });
      if (input.transcript.turns.length > 0) {
        await tx.insert(meetingTranscriptTurn).values(
          input.transcript.turns.map((turn, sequence) => ({
            ...turn,
            id: crypto.randomUUID(),
            revisionId,
            sequence,
          })),
        );
      }
    }
    await tx
      .update(meetingProcessingRun)
      .set({ finishedAt: new Date(), status: "succeeded" })
      .where(eq(meetingProcessingRun.id, input.processingRunId));
    await tx
      .update(meetingSession)
      .set({
        activeTranscriptRevisionId: revisionId,
        transcriptionError: null,
        transcriptionRunId: null,
        transcriptionStatus: "ready",
      })
      .where(eq(meetingSession.id, input.meetingId));
    await rebuildMeetingSearchProjection(tx, input);
    return true;
  });
}

export async function resetMeetingTranscriptionForRetry(input: {
  meetingId: string;
  organizationId: string;
}) {
  return await db.transaction(async (tx) => {
    const reset = await tx
      .update(meetingSession)
      .set({ transcriptionError: null, transcriptionStatus: "pending" })
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
          eq(meetingSession.transcriptionStatus, "failed"),
        ),
      )
      .returning({ id: meetingSession.id });
    if (reset.length > 0) {
      await tx
        .delete(meetingTranscriptionChunk)
        .where(
          and(
            eq(meetingTranscriptionChunk.meetingId, input.meetingId),
            eq(meetingTranscriptionChunk.organizationId, input.organizationId),
            ne(meetingTranscriptionChunk.status, "succeeded"),
          ),
        );
    }
    return reset;
  });
}

export function listMeetingProcessingRuns(input: { meetingId: string; organizationId: string }) {
  return db
    .select()
    .from(meetingProcessingRun)
    .where(
      and(
        eq(meetingProcessingRun.meetingId, input.meetingId),
        eq(meetingProcessingRun.organizationId, input.organizationId),
      ),
    )
    .orderBy(desc(meetingProcessingRun.startedAt));
}
