import {
  enqueueHumanInterviewEvaluationJobs,
  isHumanInterviewEvaluationQueueConfigured,
} from "@app/meeting-processing-queue/human-interview-evaluation";
import { createRequestAutomaticHumanInterviewEvaluation } from "@app/meeting-processing/human-interview";
import {
  claimHumanInterviewEvaluationAfterTranscriptCorrection,
  requestHumanInterviewEvaluation,
} from "../dao/human-interview-evaluation";
import {
  getMeetingTranscriptionJobForMeeting,
  resetMeetingTranscriptionForRetry,
} from "../../../../meetings/transcription/dao";
import {
  isMeetingTranscriptionQueueConfigured,
  retryMeetingTranscriptionJob,
} from "@app/meeting-processing-queue/meeting-transcription";

export async function requestAutomaticHumanInterviewEvaluation(
  input: {
    meetingSessionId: string;
    organizationId: string;
  },
  overrides: Partial<{
    enqueueEvaluationJobs: typeof enqueueHumanInterviewEvaluationJobs;
    isEvaluationQueueConfigured: typeof isHumanInterviewEvaluationQueueConfigured;
    requestEvaluation: typeof requestHumanInterviewEvaluation;
  }> = {},
): Promise<void> {
  const dependencies = {
    enqueueEvaluationJobs: enqueueHumanInterviewEvaluationJobs,
    isEvaluationQueueConfigured: isHumanInterviewEvaluationQueueConfigured,
    requestEvaluation: requestHumanInterviewEvaluation,
    ...overrides,
  };
  await createRequestAutomaticHumanInterviewEvaluation({
    enqueueJobs: dependencies.enqueueEvaluationJobs,
    isQueueConfigured: dependencies.isEvaluationQueueConfigured,
    requestEvaluation: dependencies.requestEvaluation,
  })(input);
}

export async function requestHumanInterviewEvaluationAfterTranscriptCorrection(
  input: {
    meetingSessionId: string;
    organizationId: string;
    roundId: string;
  },
  overrides: Partial<{
    claimCorrectedEvaluation: typeof claimHumanInterviewEvaluationAfterTranscriptCorrection;
    enqueueEvaluationJobs: typeof enqueueHumanInterviewEvaluationJobs;
    isEvaluationQueueConfigured: typeof isHumanInterviewEvaluationQueueConfigured;
  }> = {},
): Promise<void> {
  const dependencies = {
    claimCorrectedEvaluation: claimHumanInterviewEvaluationAfterTranscriptCorrection,
    enqueueEvaluationJobs: enqueueHumanInterviewEvaluationJobs,
    isEvaluationQueueConfigured: isHumanInterviewEvaluationQueueConfigured,
    ...overrides,
  };
  if (!dependencies.isEvaluationQueueConfigured()) {
    return;
  }
  const job = await dependencies.claimCorrectedEvaluation(input);
  if (job) {
    await dependencies.enqueueEvaluationJobs([job]);
  }
}

export async function requestManualHumanInterviewEvaluation(input: {
  meetingSessionId: string;
  organizationId: string;
}): Promise<boolean> {
  if (!isHumanInterviewEvaluationQueueConfigured()) {
    return false;
  }
  const job = await requestHumanInterviewEvaluation({ ...input, force: true });
  if (!job) {
    return false;
  }
  await enqueueHumanInterviewEvaluationJobs([job]);
  return true;
}

export async function retryHumanInterviewTranscription(input: {
  meetingSessionId: string;
  organizationId: string;
}): Promise<"processing" | "unavailable"> {
  if (!isMeetingTranscriptionQueueConfigured()) {
    return "unavailable";
  }
  await resetMeetingTranscriptionForRetry({
    meetingId: input.meetingSessionId,
    organizationId: input.organizationId,
  });
  const job = await getMeetingTranscriptionJobForMeeting({
    meetingId: input.meetingSessionId,
    organizationId: input.organizationId,
    preferFallback: true,
  });
  if (!job) {
    return "unavailable";
  }
  await retryMeetingTranscriptionJob(job);
  return "processing";
}
