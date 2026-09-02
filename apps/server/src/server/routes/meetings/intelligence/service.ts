import {
  enqueueMeetingIntelligenceJobs,
  isMeetingIntelligenceQueueConfigured,
  MEETING_INTELLIGENCE_PIPELINE_VERSION,
  MEETING_INTELLIGENCE_PROMPT_VERSION,
} from "@app/meeting-processing-queue/meeting-intelligence";
import { createRequestAutomaticMeetingIntelligence } from "@app/meeting-processing/intelligence";
import type {
  MeetingIntelligenceResult,
  MeetingIntelligenceTemplate,
} from "@app/shared/meeting-intelligence";
import { meetingAccessCapabilities } from "../access";
import { loadAuthorizedMeeting, meetingRole } from "../authorized-meeting";
import { recordMeetingAudit } from "../dao";
import { loadMeetingIntelligenceResult, requestMeetingIntelligenceRun } from "./dao";
import { getMeetingIntelligenceGeneratorSnapshot } from "./generator";

const ADMIN_ACCESS_AUDIT_DEDUPE_MS = 5 * 60 * 1000;

interface IntelligenceMeetingAccess {
  role: Parameters<typeof meetingAccessCapabilities>[0];
}
export interface MeetingIntelligenceDependencies {
  enqueueMeetingIntelligenceJobs: typeof enqueueMeetingIntelligenceJobs;
  getMeetingIntelligenceGeneratorSnapshot: typeof getMeetingIntelligenceGeneratorSnapshot;
  isMeetingIntelligenceQueueConfigured: typeof isMeetingIntelligenceQueueConfigured;
  loadMeetingAccess: (
    input: Parameters<typeof loadAuthorizedMeeting>[0],
  ) => Promise<IntelligenceMeetingAccess | null>;
  loadMeetingIntelligenceResult: typeof loadMeetingIntelligenceResult;
  recordMeetingAudit: typeof recordMeetingAudit;
  requestMeetingIntelligenceRun: typeof requestMeetingIntelligenceRun;
}
const defaultDependencies: MeetingIntelligenceDependencies = {
  enqueueMeetingIntelligenceJobs,
  getMeetingIntelligenceGeneratorSnapshot,
  isMeetingIntelligenceQueueConfigured,
  loadMeetingAccess: async (input) => {
    const meeting = await loadAuthorizedMeeting(input);
    return meeting ? { role: meetingRole(meeting, input) } : null;
  },
  loadMeetingIntelligenceResult,
  recordMeetingAudit,
  requestMeetingIntelligenceRun,
};

async function enqueueIntelligenceBestEffort(
  processingRunId: string,
  dependencies: MeetingIntelligenceDependencies,
): Promise<void> {
  try {
    await dependencies.enqueueMeetingIntelligenceJobs([{ processingRunId }]);
  } catch (error) {
    console.error("[meeting-intelligence] failed to enqueue processing run", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      processingRunId,
    });
  }
}

export async function getSavedMeetingIntelligence(
  input: {
    meetingId: string;
    memberRole: string;
    organizationId: string;
    userId: string;
  },
  dependencies: MeetingIntelligenceDependencies = defaultDependencies,
): Promise<MeetingIntelligenceResult | null> {
  const meeting = await dependencies.loadMeetingAccess(input);
  if (!meeting) {
    return null;
  }
  const { role } = meeting;
  if (role === "administrator") {
    await dependencies.recordMeetingAudit({
      action: "meeting.intelligence_accessed",
      actorId: input.userId,
      dedupeWithinMs: ADMIN_ACCESS_AUDIT_DEDUPE_MS,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
  }
  const result = await dependencies.loadMeetingIntelligenceResult(input);
  return result
    ? {
        ...result,
        canRegenerate: meetingAccessCapabilities(role).canRegenerateIntelligence,
      }
    : null;
}

export async function regenerateSavedMeetingIntelligence(
  input: {
    meetingId: string;
    memberRole: string;
    organizationId: string;
    template: MeetingIntelligenceTemplate;
    userId: string;
  },
  dependencies: MeetingIntelligenceDependencies = defaultDependencies,
): Promise<{ state: "processing" } | "forbidden" | "not-ready" | "unavailable" | null> {
  const meeting = await dependencies.loadMeetingAccess(input);
  if (!meeting) {
    return null;
  }
  if (!meetingAccessCapabilities(meeting.role).canRegenerateIntelligence) {
    return "forbidden";
  }
  if (!dependencies.isMeetingIntelligenceQueueConfigured()) {
    return "unavailable";
  }
  const generator = dependencies.getMeetingIntelligenceGeneratorSnapshot();
  const run = await dependencies.requestMeetingIntelligenceRun({
    actorId: input.userId,
    meetingId: input.meetingId,
    model: generator.model,
    organizationId: input.organizationId,
    pipelineVersion: MEETING_INTELLIGENCE_PIPELINE_VERSION,
    promptVersion: MEETING_INTELLIGENCE_PROMPT_VERSION,
    provider: generator.provider,
    requestKind: "manual",
    template: input.template,
  });
  if (!run) {
    return "not-ready";
  }
  if (run === "forbidden") {
    return "forbidden";
  }
  await enqueueIntelligenceBestEffort(run.processingRunId, dependencies);
  return { state: "processing" };
}

export async function requestAutomaticMeetingIntelligence(
  input: {
    meetingId: string;
    organizationId: string;
  },
  dependencies: MeetingIntelligenceDependencies = defaultDependencies,
): Promise<void> {
  await createRequestAutomaticMeetingIntelligence({
    enqueueJobs: dependencies.enqueueMeetingIntelligenceJobs,
    getGeneratorSnapshot: dependencies.getMeetingIntelligenceGeneratorSnapshot,
    isQueueConfigured: dependencies.isMeetingIntelligenceQueueConfigured,
    loadResult: dependencies.loadMeetingIntelligenceResult,
    requestRun: dependencies.requestMeetingIntelligenceRun,
  })(input);
}
