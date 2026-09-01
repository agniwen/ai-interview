import { listTextFiltersSchema } from "@arc/shared/list-text-filters";
import { z } from "zod";

export const workspaceMemberListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(["createdAt", "lastActiveAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  textFilters: listTextFiltersSchema("members"),
});
const memberRecordSchema = z.object({
  createdAt: z.iso.datetime(),
  email: z.string(),
  id: z.string(),
  image: z.string().nullable(),
  lastActiveAt: z.iso.datetime().nullable().optional(),
  memberId: z.string().optional(),
  name: z.string(),
  role: z.string(),
  userId: z.string().optional(),
});
export const workspaceMemberListResponseSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  records: z.array(memberRecordSchema),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export const workspaceMemberOptionsResponseSchema = z.object({
  feishuHumanInterviewEnabled: z.boolean(),
  records: z.array(
    memberRecordSchema.extend({
      feishuProviderIds: z.array(z.enum(["feishu", "feishu-jiguang-hr"])),
    }),
  ),
});
