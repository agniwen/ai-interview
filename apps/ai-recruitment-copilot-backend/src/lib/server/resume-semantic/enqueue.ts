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
    const { enqueueResumeSemanticIndexJobs } =
      await import("@arc/resume-parse-queue/resume-semantic-index");
    await enqueueResumeSemanticIndexJobs([
      {
        organizationId: input.organizationId,
        sourceId: input.sourceId,
        sourceType: input.sourceType,
      },
    ]);
  } catch (error) {
    console.warn("[resume-semantic-index] enqueue failed", {
      error,
      sourceId: input.sourceId,
      sourceType: input.sourceType,
    });
  }
}
