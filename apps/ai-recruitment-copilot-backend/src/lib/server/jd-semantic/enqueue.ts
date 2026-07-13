import { and, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { isResumeSemanticIndexEnabled } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/embedding";
import { resumeSemanticIndex } from "@arc/db-schema/schema";

export async function enqueueJobDescriptionIndexJobBestEffort(input: {
  organizationId: string;
  jobDescriptionId: string | null | undefined;
}): Promise<void> {
  if (!(input.jobDescriptionId && isResumeSemanticIndexEnabled())) {
    return;
  }
  const job = {
    organizationId: input.organizationId,
    sourceId: input.jobDescriptionId,
    sourceType: "job_description" as const,
  };
  try {
    const { prepareJdSemanticIndexJob } = await import("./indexer");
    if (!(await prepareJdSemanticIndexJob(job))) {
      return;
    }
    const { enqueueResumeSemanticIndexJobs } =
      await import("@arc/resume-parse-queue/resume-semantic-index");
    await enqueueResumeSemanticIndexJobs([job]);
  } catch (error) {
    console.warn("[jd-semantic-index] enqueue failed", {
      jobDescriptionId: input.jobDescriptionId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function deleteJobDescriptionSemanticIndexBestEffort(input: {
  organizationId: string;
  jobDescriptionId: string;
}): Promise<void> {
  try {
    const { getResumeSemanticIndexConfig } =
      await import("@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/indexer");
    const { QdrantResumeVectorStore } =
      await import("@arc/ai-recruitment-copilot-backend/lib/server/qdrant/resume-vector-store");
    const cfg = getResumeSemanticIndexConfig();
    if (!cfg.qdrantUrl) {
      return;
    }
    const store = new QdrantResumeVectorStore({
      apiKey: cfg.qdrantApiKey,
      collectionName: cfg.qdrantCollectionName,
      dimensions: cfg.dimensions,
      url: cfg.qdrantUrl,
    });
    await store.deleteResumeEmbeddings({
      sourceId: input.jobDescriptionId,
      sourceType: "job_description",
    });
    await db
      .delete(resumeSemanticIndex)
      .where(
        and(
          eq(resumeSemanticIndex.sourceType, "job_description"),
          eq(resumeSemanticIndex.sourceId, input.jobDescriptionId),
          eq(resumeSemanticIndex.organizationId, input.organizationId),
        ),
      );
  } catch (error) {
    console.warn("[jd-semantic-index] delete failed", {
      jobDescriptionId: input.jobDescriptionId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
