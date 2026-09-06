import { recruitingBoardViewSchema } from "@app/shared/recruiting-board";
import { createdAtDateQuerySchema } from "@app/shared/date-range-filter";
import { listTextFiltersSchema } from "@app/shared/list-text-filters";
import { z } from "zod";

export const resumeLibraryListQuerySchema = createdAtDateQuerySchema.safeExtend({
  boardView: recruitingBoardViewSchema.optional(),
  creatorIds: z.string().optional(),
  jdIds: z.string().optional(),
  knownTotal: z.coerce.number().int().min(0).max(10_000_000).optional(),
  nodeResults: z.string().optional(),
  nodeStatuses: z.string().optional(),
  outcomes: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
  pipelineStages: z.string().optional(),
  recommendationLevels: z.string().optional(),
  search: z.string().optional(),
  skills: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  structuredMaxScore: z.coerce.number().int().min(0).max(100).optional(),
  structuredMinScore: z.coerce.number().int().min(0).max(100).optional(),
  textFilters: listTextFiltersSchema("resumes"),
});
