import {
  enqueueMeetingIntelligenceJobs,
  isMeetingIntelligenceQueueConfigured,
  MEETING_INTELLIGENCE_PIPELINE_VERSION,
  MEETING_INTELLIGENCE_PROMPT_VERSION,
} from "@arc/meeting-processing-queue/meeting-intelligence";
import type {
  MeetingIntelligenceResult,
  MeetingIntelligenceTemplate,
} from "@arc/shared/meeting-intelligence";
import { meetingAccessCapabilities } from "../access";
import { loadAuthorizedMeeting, meetingRole } from "../authorized-meeting";
import { recordMeetingAudit } from "../dao";
import { loadMeetingIntelligenceResult, requestMeetingIntelligenceRun } from "./dao";
import { getMeetingIntelligenceGeneratorSnapshot } from "./generator";

const ADMIN_ACCESS_AUDIT_DEDUPE_MS = 5 * 60 * 1000;

async function enqueueIntelligenceBestEffort(processingRunId: string): Promise<void> {
  try {
    await enqueueMeetingIntelligenceJobs([{ processingRunId }]);
  } catch (error) {
    console.error("[meeting-intelligence] failed to enqueue processing run", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      processingRunId,
    });
  }
}

export async function getSavedMeetingIntelligence(input: {
  meetingId: string;
  memberRole: string;
  organizationId: string;
  userId: string;
}): Promise<MeetingIntelligenceResult | null> {
  const meeting = await loadAuthorizedMeeting(input);
  if (!meeting) {
    return null;
  }
  const role = meetingRole(meeting, input);
  if (role === "administrator") {
    await recordMeetingAudit({
      action: "meeting.intelligence_accessed",
      actorId: input.userId,
      dedupeWithinMs: ADMIN_ACCESS_AUDIT_DEDUPE_MS,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
  }
  const result = await loadMeetingIntelligenceResult(input);
  return result
    ? {
        ...result,
        canRegenerate: meetingAccessCapabilities(role).canRegenerateIntelligence,
      }
    : null;
}

export async function regenerateSavedMeetingIntelligence(input: {
  meetingId: string;
  memberRole: string;
  organizationId: string;
  template: MeetingIntelligenceTemplate;
  userId: string;
}): Promise<{ state: "processing" } | "forbidden" | "not-ready" | "unavailable" | null> {
  const meeting = await loadAuthorizedMeeting(input);
  if (!meeting) {
    return null;
  }
  if (!meetingAccessCapabilities(meetingRole(meeting, input)).canRegenerateIntelligence) {
    return "forbidden";
  }
  if (!isMeetingIntelligenceQueueConfigured()) {
    return "unavailable";
  }
  const generator = getMeetingIntelligenceGeneratorSnapshot();
  const run = await requestMeetingIntelligenceRun({
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
  await enqueueIntelligenceBestEffort(run.processingRunId);
  return { state: "processing" };
}

export async function requestAutomaticMeetingIntelligence(input: {
  meetingId: string;
  organizationId: string;
}): Promise<void> {
  if (!isMeetingIntelligenceQueueConfigured()) {
    return;
  }
  const [current, generator] = await Promise.all([
    loadMeetingIntelligenceResult(input),
    Promise.resolve(getMeetingIntelligenceGeneratorSnapshot()),
  ]);
  if (!current) {
    return;
  }
  const run = await requestMeetingIntelligenceRun({
    actorId: null,
    meetingId: input.meetingId,
    model: generator.model,
    organizationId: input.organizationId,
    pipelineVersion: MEETING_INTELLIGENCE_PIPELINE_VERSION,
    promptVersion: MEETING_INTELLIGENCE_PROMPT_VERSION,
    provider: generator.provider,
    requestKind: "automatic",
    template: current.current?.template ?? current.suggestedTemplate,
  });
  if (run && run !== "forbidden") {
    await enqueueIntelligenceBestEffort(run.processingRunId);
  }
}
