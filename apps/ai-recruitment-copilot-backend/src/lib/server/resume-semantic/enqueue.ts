import { isResumeSemanticIndexEnabled } from "./embedding";

export async function enqueueResumeSemanticIndexJobBestEffort(input: {
  organizationId: string;
  sourceId: string | null | undefined;
  sourceType: "resume_pool_item" | "studio_interview";
}): Promise<void> {
  if (!(input.sourceId && isResumeSemanticIndexEnabled())) {
    return;
  }
  try {
    const { prepareResumeSemanticIndexJob } = await import("./indexer");
    const job = {
      organizationId: input.organizationId,
      sourceId: input.sourceId,
      sourceType: input.sourceType,
    };
    if (!(await prepareResumeSemanticIndexJob(job))) {
      return;
    }
    const { enqueueResumeSemanticIndexJobs } =
      await import("@arc/resume-parse-queue/resume-semantic-index");
    await enqueueResumeSemanticIndexJobs([job]);
  } catch (error) {
    console.warn("[resume-semantic-index] enqueue failed", {
      error,
      sourceId: input.sourceId,
      sourceType: input.sourceType,
    });
  }
}
