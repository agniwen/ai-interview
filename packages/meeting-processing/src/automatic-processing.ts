import {
  enqueueHumanInterviewEvaluationJobs,
  isHumanInterviewEvaluationQueueConfigured,
} from "@app/meeting-processing-queue/human-interview-evaluation";
import {
  enqueueMeetingIntelligenceJobs,
  isMeetingIntelligenceQueueConfigured,
  MEETING_INTELLIGENCE_PIPELINE_VERSION,
  MEETING_INTELLIGENCE_PROMPT_VERSION,
} from "@app/meeting-processing-queue/meeting-intelligence";
import type { MeetingIntelligenceTemplate } from "@app/shared/meeting-intelligence";

interface MeetingIntelligenceAutomaticDependencies {
  enqueueJobs?: typeof enqueueMeetingIntelligenceJobs;
  getGeneratorSnapshot: () => { model: string; provider: string };
  isQueueConfigured?: typeof isMeetingIntelligenceQueueConfigured;
  loadResult: (input: { meetingId: string; organizationId: string }) => Promise<{
    current: { template: MeetingIntelligenceTemplate } | null;
    suggestedTemplate: MeetingIntelligenceTemplate;
  } | null>;
  requestRun: (input: {
    actorId: null;
    meetingId: string;
    model: string;
    organizationId: string;
    pipelineVersion: string;
    promptVersion: string;
    provider: string;
    requestKind: "automatic";
    template: MeetingIntelligenceTemplate;
  }) => Promise<{ processingRunId: string } | "forbidden" | null>;
}

export function createRequestAutomaticMeetingIntelligence(
  dependencies: MeetingIntelligenceAutomaticDependencies,
) {
  return async (input: { meetingId: string; organizationId: string }): Promise<void> => {
    const isQueueConfigured =
      dependencies.isQueueConfigured ?? isMeetingIntelligenceQueueConfigured;
    if (!isQueueConfigured()) {
      return;
    }
    const [current, generator] = await Promise.all([
      dependencies.loadResult(input),
      Promise.resolve(dependencies.getGeneratorSnapshot()),
    ]);
    if (!current) {
      return;
    }
    const run = await dependencies.requestRun({
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
      try {
        await (dependencies.enqueueJobs ?? enqueueMeetingIntelligenceJobs)([
          { processingRunId: run.processingRunId },
        ]);
      } catch (error) {
        console.error("[meeting-intelligence] failed to enqueue processing run", {
          errorName: error instanceof Error ? error.name : "UnknownError",
          processingRunId: run.processingRunId,
        });
      }
    }
  };
}

interface HumanInterviewAutomaticDependencies {
  enqueueJobs?: typeof enqueueHumanInterviewEvaluationJobs;
  isQueueConfigured?: typeof isHumanInterviewEvaluationQueueConfigured;
  requestEvaluation: (input: {
    force: false;
    meetingSessionId: string;
    organizationId: string;
  }) => Promise<Parameters<typeof enqueueHumanInterviewEvaluationJobs>[0][number] | null>;
}

export function createRequestAutomaticHumanInterviewEvaluation(
  dependencies: HumanInterviewAutomaticDependencies,
) {
  return async (input: { meetingSessionId: string; organizationId: string }): Promise<void> => {
    const isQueueConfigured =
      dependencies.isQueueConfigured ?? isHumanInterviewEvaluationQueueConfigured;
    if (!isQueueConfigured()) {
      return;
    }
    const job = await dependencies.requestEvaluation({ ...input, force: false });
    if (job) {
      await (dependencies.enqueueJobs ?? enqueueHumanInterviewEvaluationJobs)([job]);
    }
  };
}
