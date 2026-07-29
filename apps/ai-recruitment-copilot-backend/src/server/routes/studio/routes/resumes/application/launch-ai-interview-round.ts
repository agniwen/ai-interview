import type { ResumeAnalysisResult } from "@arc/db-schema/interview/types";
import type { RecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";

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

export interface PersistLaunchInput<
  TSchedule extends LaunchSchedule,
> extends LaunchAiInterviewRoundCommand {
  decisionAuditLogId: string;
  launchAuditLogId: string;
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
  idGenerator: { next: () => string };
  invalidateCache: (organizationId: string) => void;
  persist: (input: PersistLaunchInput<TSchedule>) => Promise<LaunchAiInterviewRoundResult>;
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

    let result: LaunchAiInterviewRoundResult;
    try {
      result = await deps.persist({
        ...command,
        decisionAuditLogId: deps.idGenerator.next(),
        launchAuditLogId: deps.idGenerator.next(),
        now,
        schedule,
      });
    } catch (error) {
      throw new LaunchAiInterviewMutationError(error);
    }
    if (result.ok) {
      deps.invalidateCache(command.organizationId);
    }
    return result;
  };
}
