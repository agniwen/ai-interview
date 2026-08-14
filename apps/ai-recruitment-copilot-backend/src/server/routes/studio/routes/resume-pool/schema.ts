import { z } from "zod";
import { resumePoolCreateSchema, resumePoolImportSchema } from "@arc/shared/resume-pool";

export const resumePoolListQuerySchema = z.object({
  scope: z.enum(["private", "public"]).default("private"),
  uploaderId: z.string().trim().min(1).optional(),
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
  })
  .transform((value) => ({
    ...value,
    jobDescriptionId: value.jobDescriptionMode === "bind" ? (value.jobDescriptionId ?? null) : null,
  }));

export const resumePoolCreateInputSchema = resumePoolCreateSchema;

export const resumePoolBindSchema = z.object({
  jobDescriptionId: z.string().trim().min(1),
});
