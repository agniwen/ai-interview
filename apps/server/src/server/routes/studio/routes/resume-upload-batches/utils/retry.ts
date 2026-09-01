import {
  enqueueResumeParseJobs,
  isResumeParseQueueConfigured,
} from "@arc/resume-parse-queue/resume-parse";
import type {
  ResumeParseRetryClaim,
  ResumeParseRetryRequest,
  ResumeParseRetryTarget,
} from "../dao/retry";
import type { ResumeParseJobData } from "@arc/resume-parse-queue/resume-parse";

interface ResumeParseRetryAdapters {
  claim: (input: ResumeParseRetryRequest) => Promise<ResumeParseRetryClaim>;
  enqueue: (jobs: ResumeParseJobData[]) => Promise<void>;
  isQueueConfigured: () => boolean;
  rollback: (input: {
    errorMessage: string;
    job: ResumeParseJobData;
    target: ResumeParseRetryTarget & { organizationId: string };
  }) => Promise<void>;
}

const DEFAULT_ADAPTERS: ResumeParseRetryAdapters = {
  claim: async (input) => {
    const { claimFailedResumeParseRetry } = await import("../dao/retry");
    return claimFailedResumeParseRetry(input);
  },
  enqueue: enqueueResumeParseJobs,
  isQueueConfigured: isResumeParseQueueConfigured,
  rollback: async (input) => {
    const { rollbackFailedResumeParseRetry } = await import("../dao/retry");
    await rollbackFailedResumeParseRetry(input);
  },
};

export type ResumeParseRetryResult =
  | { status: "queued" }
  | { status: "not_failed" | "not_found" | "queue_unavailable" };

export type ResumeForceReparseResult =
  | { status: "queued" }
  | { status: "busy" | "not_found" | "no_file" | "queue_unavailable" };

export async function retryFailedResumeParse(
  input: ResumeParseRetryRequest,
  adapters: ResumeParseRetryAdapters = DEFAULT_ADAPTERS,
): Promise<ResumeParseRetryResult> {
  if (!adapters.isQueueConfigured()) {
    return { status: "queue_unavailable" };
  }
  const claim = await adapters.claim(input);
  if (claim.status !== "claimed") {
    return claim;
  }
  try {
    await adapters.enqueue([claim.job]);
  } catch (error) {
    await adapters.rollback({
      errorMessage: claim.errorMessage,
      job: claim.job,
      target: input,
    });
    throw new Error("简历解析队列入队失败，请稍后重试。", { cause: error });
  }
  return { status: "queued" };
}

export async function forceResumeReparse(input: {
  organizationId: string;
  requestedBy: string;
  resumeRecordId: string;
}): Promise<ResumeForceReparseResult> {
  if (!isResumeParseQueueConfigured()) {
    return { status: "queue_unavailable" };
  }
  const { claimForceResumeReparse, rollbackForceResumeReparse } = await import("../dao/retry");
  const claim = await claimForceResumeReparse(input);
  if (claim.status !== "claimed") {
    return claim;
  }
  try {
    await enqueueResumeParseJobs([claim.job]);
  } catch (error) {
    await rollbackForceResumeReparse({
      job: claim.job,
      organizationId: input.organizationId,
      previousStatus: claim.previousStatus,
      resumeRecordId: input.resumeRecordId,
    });
    throw new Error("简历解析队列入队失败，请稍后重试。", { cause: error });
  }
  return { status: "queued" };
}
