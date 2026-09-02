import { listTextFiltersSchema } from "@app/shared/list-text-filters";
import { z } from "zod";
import { resumePoolCreateSchema, resumePoolImportSchema } from "@app/shared/resume-pool";
import { createdAtDateQuerySchema } from "@app/shared/date-range-filter";
export {
  nextShanghaiCalendarDayStart,
  shanghaiCalendarDayStart,
} from "@app/shared/date-range-filter";

export const resumePoolListQuerySchema = createdAtDateQuerySchema.safeExtend({
  importStatus: z.enum(["imported", "not_imported"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(60),
  offset: z.coerce.number().int().min(0).default(0),
  scope: z.enum(["private", "public"]).default("private"),
  search: z.string().trim().max(200).optional(),
  sortBy: z.enum(["candidateName", "createdAt", "updatedAt"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  sourceType: z.enum(["all", "non_referral", "referral"]).default("all"),
  textFilters: listTextFiltersSchema("resumes"),
  uploaderId: z.string().trim().min(1).optional(),
  uploaderIds: z.string().trim().optional(),
});

export const resumePoolImportInputSchema = resumePoolImportSchema
  .superRefine((value, ctx) => {
    if (value.jobDescriptionMode === "bind" && !value.jobDescriptionId) {
      ctx.addIssue({
        code: "custom",
        message: "绑定岗位时必须选择岗位。",
        path: ["jobDescriptionId"],
      });
    }
    if (value.jobDescriptionMode !== "bind" && value.initialRecruitmentStage !== "screening") {
      ctx.addIssue({
        code: "custom",
        message: "进入后续招聘阶段时必须关联岗位。",
        path: ["initialRecruitmentStage"],
      });
    }
  })
  .transform((value) => ({
    ...value,
    jobDescriptionId: value.jobDescriptionMode === "bind" ? (value.jobDescriptionId ?? null) : null,
  }));

export const resumePoolCreateInputSchema = resumePoolCreateSchema;

export const resumePoolBindSchema = z.object({
  jobDescriptionId: z.string().trim().min(1),
});
