import { attachmentParseStatusValues, attachmentTextSourceValues } from "@app/db-schema/db-enums";
import { z } from "zod";

export const resumeParseCacheFilterSchema = z.object({
  cacheType: z.enum(["all", "structured", "text_only"]).default("all"),
  parsedStatus: z.enum(["all", ...attachmentParseStatusValues]).default("all"),
  textSource: z.enum(["all", ...attachmentTextSourceValues]).default("all"),
});

export type ResumeParseCacheFilters = z.infer<typeof resumeParseCacheFilterSchema> &
  Record<string, string>;
