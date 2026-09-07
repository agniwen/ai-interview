import type { z } from "zod";
import { getInitialInterviewRolesIssue } from "@app/shared/human-initial-interview";
import type {
  InitialInterviewRoles,
  InitialInterviewSnapshot,
  InitialInterviewStatus,
  InitialInterviewTurn,
  initialInterviewHrEvaluationSchema,
} from "@app/shared/human-initial-interview";
import type { InitialInterviewScope } from "../dao";
import { InitialInterviewError } from "../errors";

export type InitialInterviewEvaluation = z.infer<typeof initialInterviewHrEvaluationSchema>;
export interface InitialInterviewJob extends InitialInterviewScope {
  id: string;
  initialInterviewId: string;
  actorId: string | null;
  status: InitialInterviewStatus;
  snapshot: InitialInterviewSnapshot;
  roles: InitialInterviewRoles;
  turns: InitialInterviewTurn[];
  evaluation: InitialInterviewEvaluation | null;
  overwriteDocumentId: string | null;
  documentId: string | null;
}

export interface InitialInterviewProcessorDependencies {
  load(organizationId: string, versionId: string): Promise<InitialInterviewJob | null>;
  withLock<T>(scope: InitialInterviewScope, run: () => Promise<T>): Promise<T>;
  update(
    job: InitialInterviewJob,
    patch: {
      status?: InitialInterviewStatus;
      roles?: InitialInterviewRoles;
      evaluation?: InitialInterviewEvaluation;
      documentId?: string;
      documentUrl?: string;
      completedAt?: Date;
      error?: string | null;
    },
  ): Promise<void>;
  identify(job: InitialInterviewJob): Promise<InitialInterviewRoles | null>;
  generate(job: InitialInterviewJob): Promise<InitialInterviewEvaluation>;
  publish(
    job: InitialInterviewJob,
    evaluation: InitialInterviewEvaluation,
  ): Promise<{ documentId: string; documentUrl: string }>;
}

export async function processInitialInterview(
  input: { organizationId: string; versionId: string; attempt: number; maxAttempts: number },
  dependencies: InitialInterviewProcessorDependencies,
) {
  const first = await dependencies.load(input.organizationId, input.versionId);
  if (!first) {
    return;
  }
  await dependencies.withLock(first, async () => {
    const job = await dependencies.load(input.organizationId, input.versionId);
    if (!job || ["ready", "needs_speakers", "failed"].includes(job.status)) {
      return;
    }
    try {
      if (getInitialInterviewRolesIssue(job.turns, job.roles)) {
        await dependencies.update(job, { error: null, status: "identifying" });
        const identified = await dependencies.identify(job);
        if (!identified || getInitialInterviewRolesIssue(job.turns, identified)) {
          await dependencies.update(job, { status: "needs_speakers" });
          return;
        }
        job.roles = identified;
        await dependencies.update(job, { roles: identified });
      }
      await dependencies.update(job, { error: null, status: "generating" });
      const evaluation = job.evaluation ?? (await dependencies.generate(job));
      await dependencies.update(job, { evaluation });
      const document = await dependencies.publish(job, evaluation);
      await dependencies.update(job, {
        ...document,
        completedAt: new Date(),
        error: null,
        status: "ready",
      });
    } catch (error) {
      const terminal = error instanceof InitialInterviewError || input.attempt >= input.maxAttempts;
      await dependencies.update(job, {
        error: error instanceof Error ? error.message : "评价生成失败，请重试。",
        status: terminal ? "failed" : "queued",
      });
      throw error;
    }
  });
}
