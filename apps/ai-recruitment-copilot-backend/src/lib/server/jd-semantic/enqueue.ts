import { and, eq } from "drizzle-orm";
import { isResumeSemanticIndexEnabled } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/embedding";
import { resumeSemanticIndex } from "@arc/db-schema/schema";

interface JobDescriptionSemanticIndexJob {
  organizationId: string;
  sourceId: string;
  sourceType: "job_description";
}

interface JobDescriptionSemanticIndexConfig {
  dimensions: number;
  qdrantApiKey: string | null;
  qdrantCollectionName: string;
  qdrantUrl: string;
}

interface JobDescriptionSemanticIndexStore {
  deleteResumeEmbeddings(input: { sourceId: string; sourceType: "job_description" }): Promise<void>;
}

export interface JobDescriptionSemanticIndexDependencies {
  createStore(config: JobDescriptionSemanticIndexConfig): Promise<JobDescriptionSemanticIndexStore>;
  deleteState(input: { jobDescriptionId: string; organizationId: string }): Promise<void>;
  enqueueJobs(jobs: JobDescriptionSemanticIndexJob[]): Promise<void>;
  getConfig(): Promise<JobDescriptionSemanticIndexConfig>;
  isEnabled(): boolean;
  prepareJob(job: JobDescriptionSemanticIndexJob): Promise<boolean>;
}

const defaultDependencies: JobDescriptionSemanticIndexDependencies = {
  async createStore(config) {
    const { QdrantResumeVectorStore } =
      await import("@arc/ai-recruitment-copilot-backend/lib/server/qdrant/resume-vector-store");
    return new QdrantResumeVectorStore({
      apiKey: config.qdrantApiKey,
      collectionName: config.qdrantCollectionName,
      dimensions: config.dimensions,
      url: config.qdrantUrl,
    });
  },
  async deleteState(input) {
    const { db } = await import("@arc/ai-recruitment-copilot-backend/lib/server/db");
    await db
      .delete(resumeSemanticIndex)
      .where(
        and(
          eq(resumeSemanticIndex.sourceType, "job_description"),
          eq(resumeSemanticIndex.sourceId, input.jobDescriptionId),
          eq(resumeSemanticIndex.organizationId, input.organizationId),
        ),
      );
  },
  async enqueueJobs(jobs) {
    const { enqueueResumeSemanticIndexJobs } =
      await import("@arc/resume-parse-queue/resume-semantic-index");
    await enqueueResumeSemanticIndexJobs(jobs);
  },
  async getConfig() {
    const { getResumeSemanticIndexConfig } =
      await import("@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/indexer");
    return getResumeSemanticIndexConfig();
  },
  isEnabled: isResumeSemanticIndexEnabled,
  async prepareJob(job) {
    const { prepareJdSemanticIndexJob } = await import("./indexer");
    return await prepareJdSemanticIndexJob(job);
  },
};

export async function enqueueJobDescriptionIndexJobBestEffort(
  input: {
    organizationId: string;
    jobDescriptionId: string | null | undefined;
  },
  dependencies: JobDescriptionSemanticIndexDependencies = defaultDependencies,
): Promise<void> {
  if (!(input.jobDescriptionId && dependencies.isEnabled())) {
    return;
  }
  const job = {
    organizationId: input.organizationId,
    sourceId: input.jobDescriptionId,
    sourceType: "job_description" as const,
  };
  try {
    if (!(await dependencies.prepareJob(job))) {
      return;
    }
    await dependencies.enqueueJobs([job]);
  } catch (error) {
    console.warn("[jd-semantic-index] enqueue failed", {
      jobDescriptionId: input.jobDescriptionId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function deleteJobDescriptionSemanticIndexBestEffort(
  input: {
    organizationId: string;
    jobDescriptionId: string;
  },
  dependencies: JobDescriptionSemanticIndexDependencies = defaultDependencies,
): Promise<void> {
  try {
    const cfg = await dependencies.getConfig();
    if (!cfg.qdrantUrl) {
      return;
    }
    const store = await dependencies.createStore(cfg);
    await store.deleteResumeEmbeddings({
      sourceId: input.jobDescriptionId,
      sourceType: "job_description",
    });
    await dependencies.deleteState(input);
  } catch (error) {
    console.warn("[jd-semantic-index] delete failed", {
      jobDescriptionId: input.jobDescriptionId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
