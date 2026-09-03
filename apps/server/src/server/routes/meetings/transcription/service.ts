import {
  enqueueMeetingTranscriptionJobs,
  isMeetingTranscriptionQueueConfigured,
  retryMeetingTranscriptionJob,
} from "@app/meeting-processing-queue/meeting-transcription";
import type {
  CreateMeetingTranscriptCorrectionInput,
  FinalMeetingTranscriptRevision,
  MeetingTranscriptRevisionHistory,
  MeetingTranscriptResult,
  MeetingTranscriptionPolicy,
  MeetingTranscriptionProviderId,
  UpdateMeetingTranscriptionPolicyInput,
} from "@app/shared/meeting-transcription";
import type { MeetingAccessRole } from "@app/shared/meeting-recording";
import { meetingAccessCapabilities, isWorkspaceAdministrator } from "../access";
import { loadAuthorizedMeeting, meetingRole } from "../authorized-meeting";
import type { MeetingAccessInput } from "../authorized-meeting";
import { recordMeetingAudit } from "../dao";
import { requestAutomaticMeetingIntelligence } from "../intelligence/service";
import {
  DEFAULT_MEETING_TRANSCRIPTION_POLICY_REASON,
  DEFAULT_MEETING_TRANSCRIPTION_PROVIDER,
  getMeetingTranscriptionJobForMeeting,
  listRecoverableMeetingTranscriptionJobs,
  loadMeetingTranscriptionPolicy,
  resetMeetingTranscriptionForRetry,
  restoreMeetingTranscriptionAfterRetryFailure,
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

export interface TranscriptionMeetingAccess {
  activeTranscriptRevisionId: string | null;
  liveTranscriptDraft: MeetingTranscriptResult["draft"];
  role: MeetingAccessRole;
  transcriptionError: string | null;
  transcriptionStatus: string;
}

async function loadTranscriptionMeeting(
  input: MeetingAccessInput,
): Promise<TranscriptionMeetingAccess | null> {
  const meeting = await loadAuthorizedMeeting(input);
  if (!meeting) {
    return null;
  }
  return {
    activeTranscriptRevisionId: meeting.activeTranscriptRevisionId,
    liveTranscriptDraft: meeting.liveTranscriptDraft,
    role: meetingRole(meeting, input),
    transcriptionError: meeting.transcriptionError,
    transcriptionStatus: meeting.transcriptionStatus,
  };
}

export interface MeetingTranscriptionDependencies {
  createHumanMeetingTranscriptRevision: typeof createHumanMeetingTranscriptRevision;
  enqueueMeetingTranscriptionJobs: typeof enqueueMeetingTranscriptionJobs;
  getMeetingTranscriptionJobForMeeting: typeof getMeetingTranscriptionJobForMeeting;
  isMeetingTranscriptionQueueConfigured: typeof isMeetingTranscriptionQueueConfigured;
  listMeetingTranscriptRevisions: typeof listMeetingTranscriptRevisions;
  listMeetingTranscriptionProviderCandidates: typeof listMeetingTranscriptionProviderCandidates;
  listRecoverableMeetingTranscriptionJobs: typeof listRecoverableMeetingTranscriptionJobs;
  loadActiveMeetingTranscript: typeof loadActiveMeetingTranscript;
  loadTranscriptionMeeting: typeof loadTranscriptionMeeting;
  loadMeetingTranscriptRevision: typeof loadMeetingTranscriptRevision;
  loadMeetingTranscriptionPolicy: typeof loadMeetingTranscriptionPolicy;
  recordMeetingAudit: typeof recordMeetingAudit;
  requestAutomaticMeetingIntelligence: typeof requestAutomaticMeetingIntelligence;
  resetMeetingTranscriptionForRetry: typeof resetMeetingTranscriptionForRetry;
  restoreMeetingTranscriptionAfterRetryFailure: typeof restoreMeetingTranscriptionAfterRetryFailure;
  retryMeetingTranscriptionJob: typeof retryMeetingTranscriptionJob;
  updateMeetingTranscriptionPolicy: typeof updateMeetingTranscriptionPolicy;
}

const defaultDependencies: MeetingTranscriptionDependencies = {
  createHumanMeetingTranscriptRevision,
  enqueueMeetingTranscriptionJobs,
  getMeetingTranscriptionJobForMeeting,
  isMeetingTranscriptionQueueConfigured,
  listMeetingTranscriptRevisions,
  listMeetingTranscriptionProviderCandidates,
  listRecoverableMeetingTranscriptionJobs,
  loadActiveMeetingTranscript,
  loadMeetingTranscriptRevision,
  loadMeetingTranscriptionPolicy,
  loadTranscriptionMeeting,
  recordMeetingAudit,
  requestAutomaticMeetingIntelligence,
  resetMeetingTranscriptionForRetry,
  restoreMeetingTranscriptionAfterRetryFailure,
  retryMeetingTranscriptionJob,
  updateMeetingTranscriptionPolicy,
};

async function enqueueRecoverableTranscriptionsBestEffort(
  dependencies: MeetingTranscriptionDependencies,
): Promise<void> {
  try {
    const jobs = await dependencies.listRecoverableMeetingTranscriptionJobs();
    await dependencies.enqueueMeetingTranscriptionJobs(jobs);
  } catch (error) {
    console.error("[meeting-transcription] failed to enqueue recoverable jobs", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

export async function getWorkspaceMeetingTranscriptionPolicy(
  input: {
    memberRole: string;
    organizationId: string;
  },
  dependencies: MeetingTranscriptionDependencies = defaultDependencies,
): Promise<MeetingTranscriptionPolicy> {
  const [policy, availableProviders] = await Promise.all([
    dependencies.loadMeetingTranscriptionPolicy(input.organizationId),
    Promise.resolve(dependencies.listMeetingTranscriptionProviderCandidates()),
  ]);
  const available = new Set(availableProviders.map((provider) => provider.id));
  const defaultProviderAvailable = available.has(DEFAULT_MEETING_TRANSCRIPTION_PROVIDER);
  const {
    allowedProviders: configuredProviders,
    fallbackProvider,
    revision,
    selectedProvider: configuredProvider,
    selectionReason: configuredReason,
  } = policy;
  const usingDefaultPolicy = revision === 0 && defaultProviderAvailable;
  const availableProvider = (provider: MeetingTranscriptionProviderId | null) =>
    provider && available.has(provider) ? provider : null;
  // 未配置策略时默认展示 Qwen ASR，避免面板上出现“无可用 provider”的误导。
  const selectedProvider = usingDefaultPolicy
    ? DEFAULT_MEETING_TRANSCRIPTION_PROVIDER
    : availableProvider(configuredProvider);
  let allowedProviders: MeetingTranscriptionProviderId[];
  if (revision > 0) {
    allowedProviders = configuredProviders.filter((provider) => available.has(provider));
  } else if (defaultProviderAvailable) {
    allowedProviders = [DEFAULT_MEETING_TRANSCRIPTION_PROVIDER];
  } else {
    allowedProviders = [];
  }

  return {
    allowedProviders,
    availableProviders,
    canManage: isWorkspaceAdministrator(input.memberRole),
    fallbackProvider:
      selectedProvider && fallbackProvider && available.has(fallbackProvider)
        ? fallbackProvider
        : null,
    revision,
    selectedProvider,
    selectionReason: selectedProvider
      ? (configuredReason ??
        (usingDefaultPolicy ? DEFAULT_MEETING_TRANSCRIPTION_POLICY_REASON : null))
      : null,
  };
}

export async function updateWorkspaceMeetingTranscriptionPolicy(
  input: {
    memberRole: string;
    organizationId: string;
    policy: UpdateMeetingTranscriptionPolicyInput;
    userId: string;
  },
  dependencies: MeetingTranscriptionDependencies = defaultDependencies,
): Promise<"forbidden" | "invalid-provider" | MeetingTranscriptionPolicy> {
  if (!isWorkspaceAdministrator(input.memberRole)) {
    return "forbidden";
  }
  const availableProviders = dependencies.listMeetingTranscriptionProviderCandidates();
  const available = new Set<MeetingTranscriptionProviderId>(
    availableProviders.map((provider) => provider.id),
  );
  if (input.policy.allowedProviders.some((provider) => !available.has(provider))) {
    return "invalid-provider";
  }
  const updated = await dependencies.updateMeetingTranscriptionPolicy({
    actorId: input.userId,
    organizationId: input.organizationId,
    policy: input.policy,
  });
  if (!updated) {
    return "forbidden";
  }
  await enqueueRecoverableTranscriptionsBestEffort(dependencies);
  return {
    ...updated,
    availableProviders,
    canManage: true,
  };
}

export async function getSavedMeetingTranscript(
  input: {
    meetingId: string;
    memberRole: string;
    organizationId: string;
    userId: string;
  },
  dependencies: MeetingTranscriptionDependencies = defaultDependencies,
): Promise<MeetingTranscriptResult | null> {
  const meeting = await dependencies.loadTranscriptionMeeting(input);
  if (!meeting) {
    return null;
  }
  const { role } = meeting;
  if (role === "administrator") {
    await dependencies.recordMeetingAudit({
      action: "meeting.transcript_accessed",
      actorId: input.userId,
      dedupeWithinMs: ADMIN_ACCESS_AUDIT_DEDUPE_MS,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
  }
  const revision = meeting.activeTranscriptRevisionId
    ? await dependencies.loadActiveMeetingTranscript({
        meetingId: input.meetingId,
        organizationId: input.organizationId,
      })
    : null;
  return {
    draft: meeting.liveTranscriptDraft,
    error: meeting.transcriptionError,
    revision,
    // SAFETY: meetingSession.transcriptionStatus is constrained by the persisted transcription-status enum.
    state: meeting.transcriptionStatus as MeetingTranscriptResult["state"],
  };
}

export async function getSavedMeetingTranscriptHistory(
  input: {
    meetingId: string;
    memberRole: string;
    organizationId: string;
    userId: string;
  },
  dependencies: MeetingTranscriptionDependencies = defaultDependencies,
): Promise<MeetingTranscriptRevisionHistory | null> {
  const meeting = await dependencies.loadTranscriptionMeeting(input);
  if (!meeting) {
    return null;
  }
  if (meeting.role === "administrator") {
    await dependencies.recordMeetingAudit({
      action: "meeting.transcript_history_accessed",
      actorId: input.userId,
      dedupeWithinMs: ADMIN_ACCESS_AUDIT_DEDUPE_MS,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
  }
  return {
    records: await dependencies.listMeetingTranscriptRevisions({
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    }),
  };
}

export async function getSavedMeetingTranscriptRevision(
  input: {
    meetingId: string;
    memberRole: string;
    organizationId: string;
    revisionId: string;
    userId: string;
  },
  dependencies: MeetingTranscriptionDependencies = defaultDependencies,
): Promise<FinalMeetingTranscriptRevision | null> {
  const meeting = await dependencies.loadTranscriptionMeeting(input);
  if (!meeting) {
    return null;
  }
  if (meeting.role === "administrator") {
    await dependencies.recordMeetingAudit({
      action: "meeting.transcript_revision_accessed",
      actorId: input.userId,
      dedupeWithinMs: ADMIN_ACCESS_AUDIT_DEDUPE_MS,
      detail: { revisionId: input.revisionId },
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
  }
  return dependencies.loadMeetingTranscriptRevision({
    meetingId: input.meetingId,
    organizationId: input.organizationId,
    revisionId: input.revisionId,
  });
}

export async function correctSavedMeetingTranscript(
  input: {
    correction: CreateMeetingTranscriptCorrectionInput;
    meetingId: string;
    memberRole: string;
    organizationId: string;
    userId: string;
  },
  dependencies: MeetingTranscriptionDependencies = defaultDependencies,
): Promise<
  FinalMeetingTranscriptRevision | "conflict" | "forbidden" | "invalid-range" | "not-ready" | null
> {
  const meeting = await dependencies.loadTranscriptionMeeting(input);
  if (!meeting) {
    return null;
  }
  const { role } = meeting;
  if (!meetingAccessCapabilities(role).canCorrectTranscript) {
    return "forbidden";
  }
  if (meeting.transcriptionStatus !== "ready" || !meeting.activeTranscriptRevisionId) {
    return "not-ready";
  }
  const result = await dependencies.createHumanMeetingTranscriptRevision({
    actorId: input.userId,
    correction: input.correction,
    meetingId: input.meetingId,
    organizationId: input.organizationId,
  });
  if (result !== "conflict" && result !== "invalid-range" && result !== "not-found") {
    try {
      await dependencies.requestAutomaticMeetingIntelligence({
        meetingId: input.meetingId,
        organizationId: input.organizationId,
      });
    } catch (error) {
      console.error("[meeting-transcription] failed to request corrected intelligence", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        meetingId: input.meetingId,
      });
    }
  }
  return result === "not-found" ? null : result;
}

export async function retrySavedMeetingTranscription(
  input: {
    meetingId: string;
    memberRole: string;
    organizationId: string;
    userId: string;
  },
  dependencies: MeetingTranscriptionDependencies = defaultDependencies,
): Promise<{ state: "processing" | "ready" | "unavailable" } | "forbidden" | null> {
  const meeting = await dependencies.loadTranscriptionMeeting(input);
  if (!meeting) {
    return null;
  }
  if (!meetingAccessCapabilities(meeting.role).canRetryProcessing) {
    return "forbidden";
  }
  if (meeting.transcriptionStatus !== "failed" && meeting.transcriptionStatus !== "ready") {
    return { state: "processing" };
  }
  if (!dependencies.isMeetingTranscriptionQueueConfigured()) {
    return { state: "unavailable" };
  }
  const job = await dependencies.getMeetingTranscriptionJobForMeeting({
    allowTerminalStatus: true,
    meetingId: input.meetingId,
    organizationId: input.organizationId,
  });
  if (!job) {
    return { state: "unavailable" };
  }
  const reset = await dependencies.resetMeetingTranscriptionForRetry({
    meetingId: input.meetingId,
    organizationId: input.organizationId,
  });
  if (reset.length === 0) {
    return { state: "processing" };
  }
  try {
    await dependencies.retryMeetingTranscriptionJob(job);
  } catch (error) {
    await dependencies.restoreMeetingTranscriptionAfterRetryFailure({
      meetingId: input.meetingId,
      organizationId: input.organizationId,
      transcriptionError: meeting.transcriptionError,
      transcriptionStatus: meeting.transcriptionStatus,
    });
    throw error;
  }
  await dependencies.recordMeetingAudit({
    action: "meeting.transcription_regenerated",
    actorId: input.userId,
    detail: { provider: job.provider },
    meetingId: input.meetingId,
    organizationId: input.organizationId,
  });
  return { state: "processing" };
}
