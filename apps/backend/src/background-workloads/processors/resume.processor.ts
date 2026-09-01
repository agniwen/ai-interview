import type {
  ResumeParseJobContext,
  ResumeParseJobData,
} from "@arc/resume-parse-queue/resume-parse";
import type { ResumeSemanticIndexJobData } from "@arc/resume-parse-queue/resume-semantic-index";

export interface ResumeParseProcessorPorts {
  runBulkUploadWorkflow(input: {
    bypassCache: boolean | undefined;
    itemId: string;
    retryParseFailure: boolean;
  }): Promise<void>;
}

/** Preserves the legacy queue-attempt to workflow retry mapping. */
export function processResumeParseWorkload(
  input: ResumeParseJobData,
  context: ResumeParseJobContext,
  ports: ResumeParseProcessorPorts,
): Promise<void> {
  return ports.runBulkUploadWorkflow({
    bypassCache: input.bypassCache,
    itemId: input.itemId,
    retryParseFailure: context.hasAttemptsRemaining,
  });
}

export interface ResumeSemanticIndexProcessorPorts {
  indexJobDescription(input: {
    organizationId: string;
    sourceId: string;
    sourceType: "job_description";
  }): Promise<void>;
  enrichResume(input: ResumeSemanticIndexJobData): Promise<void>;
}

/** Preserves the legacy discriminated routing between JD and resume indexing. */
export function processResumeSemanticIndexWorkload(
  input: ResumeSemanticIndexJobData,
  ports: ResumeSemanticIndexProcessorPorts,
): Promise<void> {
  if (input.sourceType === "job_description") {
    return ports.indexJobDescription({
      organizationId: input.organizationId,
      sourceId: input.sourceId,
      sourceType: "job_description",
    });
  }
  return ports.enrichResume(input);
}
