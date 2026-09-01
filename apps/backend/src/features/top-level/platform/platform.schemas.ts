import { z } from "zod";
import { attachmentParseStatusValues, attachmentTextSourceValues } from "@arc/db-schema/db-enums";
import { listTextFiltersSchema } from "@arc/shared/list-text-filters";

const pageSchema = z.coerce.number().int().min(1).default(1);
const tenPerPageSchema = z.coerce.number().int().min(1).max(100).default(10);
const twentyPerPageSchema = z.coerce.number().int().min(1).max(100).default(20);
const sortOrderSchema = z.enum(["asc", "desc"]);
const resumeParseStatusValues = ["unparsed", "queued", "processing", "ready", "failed"] as const;
const resumeParseJobListStates = [
  "all",
  "active",
  "waiting",
  "delayed",
  "completed",
  "failed",
  "paused",
  "prioritized",
  "waiting-children",
] as const;

export const platformOrganizationQuerySchema = z.object({
  page: pageSchema,
  pageSize: tenPerPageSchema,
  search: z.string().optional(),
  sortBy: z.enum(["name", "slug", "createdAt", "memberCount"]).default("createdAt"),
  sortOrder: sortOrderSchema.default("desc"),
  textFilters: listTextFiltersSchema("organizations"),
});

export const platformOrganizationMembersQuerySchema = z.object({
  page: pageSchema,
  pageSize: tenPerPageSchema,
});

export const platformUsersQuerySchema = z.object({
  page: pageSchema,
  pageSize: tenPerPageSchema,
  search: z.string().optional(),
  sortBy: z.enum(["name", "email", "role", "createdAt", "lastActiveAt"]).default("lastActiveAt"),
  sortOrder: sortOrderSchema.default("desc"),
  textFilters: listTextFiltersSchema("users"),
});

export const platformUserRemarkSchema = z.object({
  remark: z.string().max(80).nullable(),
});

const nonEmptyStringSchema = z.string().trim().min(1);
const mailIngestAccountSchema = z.object({
  emailAddress: nonEmptyStringSchema.email(),
  enabled: z.boolean().default(true),
  failedMailbox: nonEmptyStringSchema.default("ARC-Failed"),
  imapHost: nonEmptyStringSchema.default("imap.qiye.aliyun.com"),
  imapPort: z.number().int().min(1).max(65_535).default(993),
  imapSecure: z.boolean().default(true),
  listenStartAt: z.string().datetime().nullable().optional(),
  mailbox: nonEmptyStringSchema.default("INBOX"),
  password: nonEmptyStringSchema,
  processedMailbox: nonEmptyStringSchema.default("ARC-Processed"),
  subjectKeyword: nonEmptyStringSchema.default("boss直聘"),
  username: nonEmptyStringSchema,
});

export const platformMailAccountsQuerySchema = z.object({
  page: pageSchema,
  pageSize: tenPerPageSchema,
  search: z.string().optional(),
  sortBy: z.enum(["userName", "userEmail", "emailAddress", "lastCheckedAt"]).default("userName"),
  sortOrder: sortOrderSchema.default("asc"),
  textFilters: listTextFiltersSchema("platformMailAccounts"),
});

export const platformCreateMailAccountSchema = mailIngestAccountSchema.extend({
  organizationId: nonEmptyStringSchema,
  userId: nonEmptyStringSchema,
});

export const platformUpdateMailAccountSchema = mailIngestAccountSchema
  .omit({ password: true })
  .partial()
  .extend({
    organizationId: nonEmptyStringSchema,
    password: nonEmptyStringSchema.optional(),
  });

export const platformQueueJobsQuerySchema = z.object({
  page: pageSchema,
  pageSize: twentyPerPageSchema,
  parseStatus: z.enum(["all", ...resumeParseStatusValues]).default("all"),
  search: z.string().optional(),
  state: z.enum(resumeParseJobListStates).default("all"),
  uploadStatus: z
    .enum(["all", "pending", "processing", "succeeded", "failed", "duplicate_skipped", "cancelled"])
    .default("all"),
});

export const platformResumeParseCacheQuerySchema = z.object({
  cacheType: z.enum(["all", "structured", "text_only"]).default("all"),
  page: pageSchema,
  pageSize: tenPerPageSchema,
  parsedStatus: z.enum(["all", ...attachmentParseStatusValues]).default("all"),
  search: z.string().optional(),
  sortBy: z.enum(["filename", "size", "parsedAt", "createdAt", "parsedStatus"]).default("parsedAt"),
  sortOrder: sortOrderSchema.default("desc"),
  textFilters: listTextFiltersSchema("parseCache"),
  textSource: z.enum(["all", ...attachmentTextSourceValues]).default("all"),
});

export const platformNotificationsQuerySchema = z.object({
  page: pageSchema,
  pageSize: twentyPerPageSchema,
  providerId: z.enum(["all", "feishu", "feishu-jiguang-hr"]).default("all"),
  search: z.string().optional(),
  sortBy: z
    .enum([
      "createdAt",
      "sentAt",
      "updatedAt",
      "status",
      "providerId",
      "candidateName",
      "organizationName",
    ])
    .default("createdAt"),
  sortOrder: sortOrderSchema.default("desc"),
  status: z.enum(["all", "pending", "sent", "failed"]).default("all"),
  textFilters: listTextFiltersSchema("notifications"),
});

export const platformLiveKitListQuerySchema = z.object({
  page: pageSchema,
  pageSize: twentyPerPageSchema,
  search: z.string().optional(),
});

export const platformLiveKitRoomsQuerySchema = platformLiveKitListQuerySchema.extend({
  textFilters: listTextFiltersSchema("rooms"),
});

export const platformLiveKitMetricsQuerySchema = platformLiveKitListQuerySchema.extend({
  textFilters: listTextFiltersSchema("metrics"),
});
