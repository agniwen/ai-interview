import { isResumeSemanticIndexEnabled } from "../resume-semantic/embedding";

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
  deleteResumeEmbeddings(input: {
    organizationId: string;
    sourceId: string;
    sourceType: "job_description";
  }): Promise<void>;
}

export interface JobDescriptionSemanticIndexDependencies {
  createStore(config: JobDescriptionSemanticIndexConfig): Promise<JobDescriptionSemanticIndexStore>;
  markDeleted(input: { jobDescriptionId: string; organizationId: string }): Promise<void>;
  enqueueJobs(jobs: JobDescriptionSemanticIndexJob[]): Promise<void>;
  getConfig(): Promise<JobDescriptionSemanticIndexConfig>;
  isEnabled(): boolean;
  markStale(input: { jobDescriptionId: string; organizationId: string }): Promise<void>;
  prepareJob(job: JobDescriptionSemanticIndexJob): Promise<boolean>;
}

const defaultDependencies: JobDescriptionSemanticIndexDependencies = {
  async createStore(config) {
    const { QdrantResumeVectorStore } = await import("../qdrant/resume-vector-store");
    return new QdrantResumeVectorStore({
      apiKey: config.qdrantApiKey,
      collectionName: config.qdrantCollectionName,
      dimensions: config.dimensions,
      url: config.qdrantUrl,
    });
  },
  async enqueueJobs(jobs) {
    const { enqueueResumeSemanticIndexJobs } =
      await import("@app/resume-parse-queue/resume-semantic-index");
    await enqueueResumeSemanticIndexJobs(jobs);
  },
  async getConfig() {
    const { getResumeSemanticIndexConfig } = await import("../resume-semantic/indexer");
    return getResumeSemanticIndexConfig();
  },
  isEnabled: isResumeSemanticIndexEnabled,
  async markDeleted(input) {
    const { getResumeSemanticIndexConfig, upsertResumeSemanticIndexState } =
      await import("../resume-semantic/indexer");
    const config = getResumeSemanticIndexConfig();
    await upsertResumeSemanticIndexState({
      contentHash: null,
      embeddingModel: config.model,
      embeddingVersion: config.embeddingVersion,
      errorMessage: "job description deleted; vector cleanup completed",
      organizationId: input.organizationId,
      profileHash: "deleted",
      sourceId: input.jobDescriptionId,
      sourceType: "job_description",
      status: "deleted",
    });
  },
  async markStale(input) {
    const { getResumeSemanticIndexConfig, upsertResumeSemanticIndexState } =
      await import("../resume-semantic/indexer");
    const config = getResumeSemanticIndexConfig();
    await upsertResumeSemanticIndexState({
      contentHash: null,
      embeddingModel: config.model,
      embeddingVersion: config.embeddingVersion,
      errorMessage: "job description deleted; vector cleanup pending",
      organizationId: input.organizationId,
      profileHash: "stale",
      sourceId: input.jobDescriptionId,
      sourceType: "job_description",
      status: "stale",
    });
  },
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
    await dependencies.markStale(input);
    const cfg = await dependencies.getConfig();
    if (!cfg.qdrantUrl) {
      return;
    }
    const store = await dependencies.createStore(cfg);
    await store.deleteResumeEmbeddings({
      organizationId: input.organizationId,
      sourceId: input.jobDescriptionId,
      sourceType: "job_description",
    });
    await dependencies.markDeleted(input);
  } catch (error) {
    console.warn("[jd-semantic-index] delete failed", {
      jobDescriptionId: input.jobDescriptionId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
