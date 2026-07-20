import { attachmentParseStatusValues, attachmentTextSourceValues } from "@arc/db-schema/db-enums";
import { z } from "zod";

export const resumeParseCacheFilterSchema = z.object({
  cacheType: z.enum(["all", "structured", "text_only"]).default("all"),
  parsedStatus: z.enum(["all", ...attachmentParseStatusValues]).default("all"),
  textSource: z.enum(["all", ...attachmentTextSourceValues]).default("all"),
});

export const resumeParseCacheQuerySchema = resumeParseCacheFilterSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  sortBy: z.enum(["filename", "size", "parsedAt", "createdAt", "parsedStatus"]).default("parsedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ResumeParseCacheFilters = z.infer<typeof resumeParseCacheFilterSchema> &
  Record<string, string>;
export type ResumeParseCacheQuery = z.infer<typeof resumeParseCacheQuerySchema>;
