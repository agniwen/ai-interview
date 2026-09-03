import { db } from "../../../../../lib/server/db";
import { bindResumeProcessingDatabase } from "@app/resume-processing/ingest/database-context";
import * as implementation from "@app/resume-processing/review/support/job-descriptions-dao";

// oxlint-disable-next-line no-barrel-file -- This route-local Server facade preserves existing imports while the reusable implementation has one package owner.
export * from "@app/resume-processing/review/support/job-descriptions-dao";

export const fetchPublishedJobDescriptionsByCodes: typeof implementation.fetchPublishedJobDescriptionsByCodes =
  bindResumeProcessingDatabase(db, implementation.fetchPublishedJobDescriptionsByCodes);
/** @deprecated Recruiting ingestion must use published jobs only. */
export const fetchJobDescriptionsByCodes: typeof implementation.fetchJobDescriptionsByCodes =
  bindResumeProcessingDatabase(db, implementation.fetchJobDescriptionsByCodes);
/** @deprecated Choose the explicit management or recruiting existence check. */
export const jobDescriptionIdsExist: typeof implementation.jobDescriptionIdsExist =
  bindResumeProcessingDatabase(db, implementation.jobDescriptionIdsExist);
/** @deprecated Choose the explicit management or recruiting loader. */
export const listAllJobDescriptions: typeof implementation.listAllJobDescriptions =
  bindResumeProcessingDatabase(db, implementation.listAllJobDescriptions);
export const listJobDescriptions: typeof implementation.listJobDescriptions =
  bindResumeProcessingDatabase(db, implementation.listJobDescriptions);
export const listManagedJobDescriptions: typeof implementation.listManagedJobDescriptions =
  bindResumeProcessingDatabase(db, implementation.listManagedJobDescriptions);
export const listRecruitingJobDescriptions: typeof implementation.listRecruitingJobDescriptions =
  bindResumeProcessingDatabase(db, implementation.listRecruitingJobDescriptions);
export const loadJobDescriptionMetrics: typeof implementation.loadJobDescriptionMetrics =
  bindResumeProcessingDatabase(db, implementation.loadJobDescriptionMetrics);
/** @deprecated Choose the explicit management or recruiting loader. */
export const loadJobDescriptionById: typeof implementation.loadJobDescriptionById =
  bindResumeProcessingDatabase(db, implementation.loadJobDescriptionById);
export const loadManagedJobDescriptionById: typeof implementation.loadManagedJobDescriptionById =
  bindResumeProcessingDatabase(db, implementation.loadManagedJobDescriptionById);
export const loadRecruitingJobDescriptionById: typeof implementation.loadRecruitingJobDescriptionById =
  bindResumeProcessingDatabase(db, implementation.loadRecruitingJobDescriptionById);
export const managedJobDescriptionIdsExist: typeof implementation.managedJobDescriptionIdsExist =
  bindResumeProcessingDatabase(db, implementation.managedJobDescriptionIdsExist);
export const parseJobDescriptionPagination: typeof implementation.parseJobDescriptionPagination =
  bindResumeProcessingDatabase(db, implementation.parseJobDescriptionPagination);
export const queryPaginatedJobDescriptions: typeof implementation.queryPaginatedJobDescriptions =
  bindResumeProcessingDatabase(db, implementation.queryPaginatedJobDescriptions);
export const recruitingJobDescriptionIdsExist: typeof implementation.recruitingJobDescriptionIdsExist =
  bindResumeProcessingDatabase(db, implementation.recruitingJobDescriptionIdsExist);
export const serializeJobDescription: typeof implementation.serializeJobDescription =
  bindResumeProcessingDatabase(db, implementation.serializeJobDescription);
