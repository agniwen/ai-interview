import {
  enqueueMeetingTranscriptionJobs,
  isMeetingTranscriptionQueueConfigured,
  retryMeetingTranscriptionJob,
} from "@arc/meeting-processing-queue/meeting-transcription";
import type {
  CreateMeetingTranscriptCorrectionInput,
  FinalMeetingTranscriptRevision,
  MeetingTranscriptRevisionHistory,
  MeetingTranscriptResult,
  MeetingTranscriptionPolicy,
  MeetingTranscriptionProviderId,
  UpdateMeetingTranscriptionPolicyInput,
} from "@arc/shared/meeting-transcription";
import { meetingAccessCapabilities, isWorkspaceAdministrator } from "../access";
import { loadAuthorizedMeeting, meetingRole } from "../authorized-meeting";
import { recordMeetingAudit } from "../dao";
import {
  getMeetingTranscriptionJobForMeeting,
  listRecoverableMeetingTranscriptionJobs,
  loadMeetingTranscriptionPolicy,
  resetMeetingTranscriptionForRetry,
  updateMeetingTranscriptionPolicy,
} from "./dao";
import { listMeetingTranscriptionProviderCandidates } from "./provider-registry";
import {
  createHumanMeetingTranscriptRevision,
  listMeetingTranscriptRevisions,
  loadActiveMeetingTranscript,
  loadMeetingTranscriptRevision,
} from "./revision-dao";

const ADMIN_ACCESS_AUDIT_DEDUPE_MS = 5 * 60 * 1000;

async function enqueueRecoverableTranscriptionsBestEffort(): Promise<void> {
  try {
    const jobs = await listRecoverableMeetingTranscriptionJobs();
    await enqueueMeetingTranscriptionJobs(jobs);
  } catch (error) {
    console.error("[meeting-transcription] failed to enqueue recoverable jobs", { error });
  }
}

export async function getWorkspaceMeetingTranscriptionPolicy(input: {
  memberRole: string;
  organizationId: string;
}): Promise<MeetingTranscriptionPolicy> {
  const [policy, availableProviders] = await Promise.all([
    loadMeetingTranscriptionPolicy(input.organizationId),
    Promise.resolve(listMeetingTranscriptionProviderCandidates()),
  ]);
  const available = new Set(availableProviders.map((provider) => provider.id));
  return {
    allowedProviders: policy.allowedProviders.filter((provider) => available.has(provider)),
    availableProviders,
    canManage: isWorkspaceAdministrator(input.memberRole),
    revision: policy.revision,
    selectedProvider:
      policy.selectedProvider && available.has(policy.selectedProvider)
        ? policy.selectedProvider
        : null,
  };
}

export async function updateWorkspaceMeetingTranscriptionPolicy(input: {
  memberRole: string;
  organizationId: string;
  policy: UpdateMeetingTranscriptionPolicyInput;
  userId: string;
}): Promise<"forbidden" | "invalid-provider" | MeetingTranscriptionPolicy> {
  if (!isWorkspaceAdministrator(input.memberRole)) {
    return "forbidden";
  }
  const availableProviders = listMeetingTranscriptionProviderCandidates();
  const available = new Set<MeetingTranscriptionProviderId>(
    availableProviders.map((provider) => provider.id),
  );
  if (input.policy.allowedProviders.some((provider) => !available.has(provider))) {
    return "invalid-provider";
  }
  const updated = await updateMeetingTranscriptionPolicy({
    actorId: input.userId,
    organizationId: input.organizationId,
    policy: input.policy,
  });
  await enqueueRecoverableTranscriptionsBestEffort();
  return {
    ...updated,
    availableProviders,
    canManage: true,
  };
}

export async function getSavedMeetingTranscript(input: {
  meetingId: string;
  memberRole: string;
  organizationId: string;
  userId: string;
}): Promise<MeetingTranscriptResult | null> {
  const meeting = await loadAuthorizedMeeting(input);
  if (!meeting) {
    return null;
  }
  const role = meetingRole(meeting, input);
  if (role === "administrator") {
    await recordMeetingAudit({
      action: "meeting.transcript_accessed",
      actorId: input.userId,
      dedupeWithinMs: ADMIN_ACCESS_AUDIT_DEDUPE_MS,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
  }
  const revision =
    meeting.transcriptionStatus === "ready"
      ? await loadActiveMeetingTranscript({
          meetingId: input.meetingId,
          organizationId: input.organizationId,
        })
      : null;
  return {
    error: meeting.transcriptionError,
    revision,
    state: meeting.transcriptionStatus as MeetingTranscriptResult["state"],
  };
}

export async function getSavedMeetingTranscriptHistory(input: {
  meetingId: string;
  memberRole: string;
  organizationId: string;
  userId: string;
}): Promise<MeetingTranscriptRevisionHistory | null> {
  const meeting = await loadAuthorizedMeeting(input);
  if (!meeting) {
    return null;
  }
  if (meetingRole(meeting, input) === "administrator") {
    await recordMeetingAudit({
      action: "meeting.transcript_history_accessed",
      actorId: input.userId,
      dedupeWithinMs: ADMIN_ACCESS_AUDIT_DEDUPE_MS,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
  }
  return {
    records: await listMeetingTranscriptRevisions({
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    }),
  };
}

export async function getSavedMeetingTranscriptRevision(input: {
  meetingId: string;
  memberRole: string;
  organizationId: string;
  revisionId: string;
  userId: string;
}): Promise<FinalMeetingTranscriptRevision | null> {
  const meeting = await loadAuthorizedMeeting(input);
  if (!meeting) {
    return null;
  }
  if (meetingRole(meeting, input) === "administrator") {
    await recordMeetingAudit({
      action: "meeting.transcript_revision_accessed",
      actorId: input.userId,
      dedupeWithinMs: ADMIN_ACCESS_AUDIT_DEDUPE_MS,
      detail: { revisionId: input.revisionId },
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
  }
  return loadMeetingTranscriptRevision({
    meetingId: input.meetingId,
    organizationId: input.organizationId,
    revisionId: input.revisionId,
  });
}

export async function correctSavedMeetingTranscript(input: {
  correction: CreateMeetingTranscriptCorrectionInput;
  meetingId: string;
  memberRole: string;
  organizationId: string;
  userId: string;
}): Promise<
  FinalMeetingTranscriptRevision | "conflict" | "forbidden" | "invalid-range" | "not-ready" | null
> {
  const meeting = await loadAuthorizedMeeting(input);
  if (!meeting) {
    return null;
  }
  const role = meetingRole(meeting, input);
  if (!meetingAccessCapabilities(role).canCorrectTranscript) {
    return "forbidden";
  }
  if (meeting.transcriptionStatus !== "ready" || !meeting.activeTranscriptRevisionId) {
    return "not-ready";
  }
  const result = await createHumanMeetingTranscriptRevision({
    actorId: input.userId,
    correction: input.correction,
    meetingId: input.meetingId,
    organizationId: input.organizationId,
  });
  return result === "not-found" ? null : result;
}

export async function retrySavedMeetingTranscription(input: {
  meetingId: string;
  memberRole: string;
  organizationId: string;
  userId: string;
}): Promise<{ state: "processing" | "ready" | "unavailable" } | "forbidden" | null> {
  const meeting = await loadAuthorizedMeeting(input);
  if (!meeting) {
    return null;
  }
  if (!meetingAccessCapabilities(meetingRole(meeting, input)).canRetryProcessing) {
    return "forbidden";
  }
  if (meeting.transcriptionStatus === "ready") {
    return { state: "ready" };
  }
  if (meeting.transcriptionStatus !== "failed") {
    return { state: "processing" };
  }
  if (!isMeetingTranscriptionQueueConfigured()) {
    return { state: "unavailable" };
  }
  const reset = await resetMeetingTranscriptionForRetry({
    meetingId: input.meetingId,
    organizationId: input.organizationId,
  });
  if (reset.length === 0) {
    return { state: "processing" };
  }
  const job = await getMeetingTranscriptionJobForMeeting({
    meetingId: input.meetingId,
    organizationId: input.organizationId,
  });
  if (!job) {
    return { state: "unavailable" };
  }
  await retryMeetingTranscriptionJob(job);
  await recordMeetingAudit({
    action: "meeting.transcription_retried",
    actorId: input.userId,
    meetingId: input.meetingId,
    organizationId: input.organizationId,
  });
  return { state: "processing" };
}
