export const JOB_EVALUATION_SNAPSHOT_COMMANDS = Symbol("JOB_EVALUATION_SNAPSHOT_COMMANDS");

export interface JobEvaluationSnapshot {
  id: string;
  jobDescriptionId: string;
  jobDescriptionName: string;
  prompt: string;
}

export interface JobEvaluationSnapshotCommands {
  ensureCurrent(
    organizationId: string,
    jobDescriptionId: string,
  ): Promise<JobEvaluationSnapshot | null>;
}
