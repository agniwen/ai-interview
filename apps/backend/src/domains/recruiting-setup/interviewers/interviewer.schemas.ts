import { MINIMAX_VOICE_IDS } from "@arc/db-schema/minimax-voices";
import { listTextFiltersSchema } from "@arc/shared/list-text-filters";
import { z } from "zod";

export const interviewerPublicVoicePreviewPathSchema = z.object({ id: z.string().min(1) });

const minimaxVoiceSchema = z.enum(MINIMAX_VOICE_IDS);
const interviewerBaseSchema = z.object({
  departmentId: z.string().trim().min(1, "请选择所属部门"),
  description: z.string().trim().max(500, "描述不能超过 500 字").optional().or(z.literal("")),
  name: z.string().trim().min(1, "请输入面试官名称").max(120, "名称不能超过 120 个字符"),
  prompt: z.string().trim().min(1, "请输入面试官 prompt").max(10_000, "prompt 不能超过 10000 字"),
  voice: minimaxVoiceSchema,
});

export const interviewerFormSchema = interviewerBaseSchema;
export const interviewerUpdateSchema = interviewerBaseSchema;

export const interviewerWorkspacePathSchema = z.object({
  workspaceSlug: z.string().trim().min(1),
});
export const interviewerPathSchema = interviewerWorkspacePathSchema.extend({
  id: z.string().trim().min(1),
});
export const interviewerListQuerySchema = z.object({
  departmentId: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  sortBy: z.enum(["createdAt", "name", "updatedAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  textFilters: listTextFiltersSchema("interviewers"),
});

export const interviewerSchema = z.object({
  createdAt: z.iso.datetime(),
  createdBy: z.string().nullable(),
  departmentId: z.string(),
  description: z.string().nullable(),
  id: z.string(),
  name: z.string(),
  prompt: z.string(),
  updatedAt: z.iso.datetime(),
  voice: minimaxVoiceSchema,
});
export const interviewerListRecordSchema = interviewerSchema.extend({
  departmentName: z.string().nullable(),
  jobDescriptionCount: z.number().int().nonnegative(),
});
export const interviewerListResponseSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  records: z.array(interviewerListRecordSchema),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export const interviewerAllResponseSchema = z.object({
  records: z.array(interviewerListRecordSchema),
});
export const interviewerDeleteResponseSchema = z.object({ success: z.literal(true) });
export const interviewerVoicePreviewInputSchema = z.object({ voice: minimaxVoiceSchema });
export const interviewerVoicePreviewResponseSchema = z.object({
  cached: z.boolean(),
  previewText: z.string(),
  url: z.string(),
  voice: minimaxVoiceSchema,
});
