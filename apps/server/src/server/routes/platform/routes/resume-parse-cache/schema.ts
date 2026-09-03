import { listTextFiltersSchema } from "@app/shared/list-text-filters";
import { resumeParseCacheFilterSchema } from "@app/shared/resume-parse-cache";
import type { ResumeParseCacheFilters } from "@app/shared/resume-parse-cache";
import { z } from "zod";

export const resumeParseCacheQuerySchema = resumeParseCacheFilterSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  sortBy: z.enum(["filename", "size", "parsedAt", "createdAt", "parsedStatus"]).default("parsedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  textFilters: listTextFiltersSchema("parseCache"),
});

export type { ResumeParseCacheFilters };
export type ResumeParseCacheQuery = z.infer<typeof resumeParseCacheQuerySchema>;
