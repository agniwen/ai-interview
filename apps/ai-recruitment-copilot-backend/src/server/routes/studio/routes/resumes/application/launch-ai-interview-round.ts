import type { ResumeAnalysisResult } from "@arc/db-schema/interview/types";
import type { PipelineStage, ResumeParseStatus } from "@arc/db-schema/studio-interviews";
import { canApplyCandidatePipelineEvent } from "@arc/shared/candidate-pipeline-machine";
import { canLaunchInterviewFromResume } from "@arc/shared/studio-resumes";
import type { RecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";

interface LaunchCandidate {
  jobDescriptionId: string | null;
  pipelineStage: PipelineStage;
  resumeParseStatus: ResumeParseStatus;
}

interface LaunchSchedule {
  id: string;
  roundLabel: string;
}

export interface LaunchAiInterviewRoundCommand {
  actorId: string;
  interviewQuestions: ResumeAnalysisResult["interviewQuestions"];
  interviewRecordId: string;
  organizationId: string;
  visibilityScope: RecruitingVisibilityScope;
}

interface CommitLaunchInput<
  TSchedule extends LaunchSchedule,
> extends LaunchAiInterviewRoundCommand {
  auditLogId: string;
  jobDescriptionId: string | null;
  now: Date;
  schedule: TSchedule;
}

interface LaunchAiInterviewRoundDependencies<TSchedule extends LaunchSchedule> {
  buildSchedule: (input: {
    actorId: string;
    interviewRecordId: string;
    now: Date;
    organizationId: string;
    roundId: string;
  }) => TSchedule | null;
  clock: { now: () => Date };
  commit: (input: CommitLaunchInput<TSchedule>) => Promise<void>;
  createSnapshot: (input: {
    actorId: string;
    interviewRecordId: string;
    scheduleEntryId: string;
  }) => Promise<void>;
  invalidateCache: (organizationId: string) => void;
  idGenerator: { next: () => string };
  loadCandidate: (input: {
    interviewRecordId: string;
    organizationId: string;
    visibilityScope: RecruitingVisibilityScope;
  }) => Promise<LaunchCandidate | null>;
}

export type LaunchAiInterviewRoundResult =
  | { ok: true; roundId: string }
  | {
      ok: false;
      reason:
        | "closed_candidate"
        | "not_found"
        | "resume_not_ready"
        | "round_not_created"
        | "stage_conflict";
    };

export class LaunchAiInterviewMutationError extends Error {
  override readonly cause: unknown;

  constructor(cause: unknown) {
    super("Failed to persist the AI interview launch.");
    this.cause = cause;
    this.name = "LaunchAiInterviewMutationError";
  }
}

export function createLaunchAiInterviewRound<TSchedule extends LaunchSchedule>(
  deps: LaunchAiInterviewRoundDependencies<TSchedule>,
) {
  return async function launchAiInterviewRound(
    command: LaunchAiInterviewRoundCommand,
  ): Promise<LaunchAiInterviewRoundResult> {
    const candidate = await deps.loadCandidate({
      interviewRecordId: command.interviewRecordId,
      organizationId: command.organizationId,
      visibilityScope: command.visibilityScope,
    });
    if (!candidate) {
      return { ok: false, reason: "not_found" };
    }
    if (candidate.pipelineStage === "closed") {
      return { ok: false, reason: "closed_candidate" };
    }
    if (
      !canApplyCandidatePipelineEvent(
        { humanInterviewReadyForOffer: false, stage: candidate.pipelineStage },
        { type: "START_AI_INTERVIEW" },
      )
    ) {
      return { ok: false, reason: "stage_conflict" };
    }
    if (!canLaunchInterviewFromResume(candidate.resumeParseStatus)) {
      return { ok: false, reason: "resume_not_ready" };
    }

    const now = deps.clock.now();
    const schedule = deps.buildSchedule({
      actorId: command.actorId,
      interviewRecordId: command.interviewRecordId,
      now,
      organizationId: command.organizationId,
      roundId: deps.idGenerator.next(),
    });
    if (!schedule) {
      return { ok: false, reason: "round_not_created" };
    }

    try {
      await deps.commit({
        ...command,
        auditLogId: deps.idGenerator.next(),
        jobDescriptionId: candidate.jobDescriptionId,
        now,
        schedule,
      });
      await deps.createSnapshot({
        actorId: command.actorId,
        interviewRecordId: command.interviewRecordId,
        scheduleEntryId: schedule.id,
      });
    } catch (error) {
      throw new LaunchAiInterviewMutationError(error);
    }
    deps.invalidateCache(command.organizationId);

    return { ok: true, roundId: schedule.id };
  };
}
