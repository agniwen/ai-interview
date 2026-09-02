import { db } from "../../../../../../lib/server/db/index";
import { createResumeIngest } from "@app/resume-processing/ingest";
import type { ResumeIngest } from "@app/resume-processing/ingest";

const ingest = createResumeIngest(db);

export const createResumeUploadBatchProcessor: ResumeIngest["createResumeUploadBatchProcessor"] =
  ingest.createResumeUploadBatchProcessor;
export const defaultResumeUploadBatchProcessorDependencies: ResumeIngest["defaultResumeUploadBatchProcessorDependencies"] =
  ingest.defaultResumeUploadBatchProcessorDependencies;
export const getClaimMissRetryError: ResumeIngest["getClaimMissRetryError"] =
  ingest.getClaimMissRetryError;
export const processBatchItem: ResumeIngest["processBatchItem"] = ingest.processBatchItem;
export const processNextItem: ResumeIngest["processNextItem"] = ingest.processNextItem;
export const toBatchDto: ResumeIngest["toBatchDto"] = ingest.toBatchDto;
export type { ResumeUploadBatchProcessorDependencies } from "@app/resume-processing/ingest";
