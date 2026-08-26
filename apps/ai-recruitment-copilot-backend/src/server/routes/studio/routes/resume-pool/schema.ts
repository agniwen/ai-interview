import { listTextFiltersSchema } from "@arc/shared/list-text-filters";
import { z } from "zod";
import { resumePoolCreateSchema, resumePoolImportSchema } from "@arc/shared/resume-pool";

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) {
    return false;
  }
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
}

const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "日期必须是 YYYY-MM-DD 格式。")
  .refine(isCalendarDate, "日期无效。");

export const resumePoolListQuerySchema = z
  .object({
    createdFrom: calendarDateSchema.optional(),
    createdTo: calendarDateSchema.optional(),
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
  })
  .superRefine((value, ctx) => {
    if (value.createdFrom && value.createdTo && value.createdFrom > value.createdTo) {
      ctx.addIssue({
        code: "custom",
        message: "开始日期不能晚于结束日期。",
        path: ["createdTo"],
      });
    }
  });

export function shanghaiCalendarDayStart(value: string): Date {
  return new Date(`${value}T00:00:00+08:00`);
}

export function nextShanghaiCalendarDayStart(value: string): Date {
  return new Date(shanghaiCalendarDayStart(value).getTime() + 86_400_000);
}

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
