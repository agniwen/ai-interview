import { listTextFiltersSchema } from "@arc/shared/list-text-filters";
import { departmentFormSchema, departmentUpdateSchema } from "@arc/shared/departments";
import { z } from "zod";
import { workspaceSlugSchema } from "../../../infrastructure/http/http.schemas.js";

export { departmentFormSchema, departmentUpdateSchema };

export const departmentPathSchema = workspaceSlugSchema.extend({ id: z.string().trim().min(1) });
export const departmentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  sortBy: z.enum(["createdAt", "name", "updatedAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  textFilters: listTextFiltersSchema("departments"),
});

export const departmentSchema = z.object({
  createdAt: z.iso.datetime(),
  createdBy: z.string().nullable(),
  description: z.string().nullable(),
  id: z.string(),
  name: z.string(),
  updatedAt: z.iso.datetime(),
});
export const departmentListRecordSchema = departmentSchema.extend({
  interviewerCount: z.number().int().nonnegative(),
  jobDescriptionCount: z.number().int().nonnegative(),
});
export const departmentListResponseSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  records: z.array(departmentListRecordSchema),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export const departmentAllResponseSchema = z.object({ records: z.array(departmentSchema) });
export const successResponseSchema = z.object({ success: z.literal(true) });
