import { listTextFiltersSchema } from "@arc/shared/list-text-filters";
import { z } from "zod";

export const mailWorkspacePathSchema = z.object({ workspaceSlug: z.string().trim().min(1) });
export const mailAccountPathSchema = mailWorkspacePathSchema.extend({
  id: z.string().trim().min(1),
});
export const managedMailListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  sortBy: z.enum(["userName", "userEmail", "emailAddress", "lastCheckedAt"]).default("userName"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  textFilters: listTextFiltersSchema("mailAccounts"),
});
const nonEmpty = z.string().trim().min(1);
export const createMailAccountSchema = z.object({
  emailAddress: z.email(),
  enabled: z.boolean().default(true),
  failedMailbox: nonEmpty.default("ARC-Failed"),
  imapHost: nonEmpty.default("imap.qiye.aliyun.com"),
  imapPort: z.number().int().min(1).max(65_535).default(993),
  imapSecure: z.boolean().default(true),
  listenStartAt: z.iso.datetime().nullable().optional(),
  mailbox: nonEmpty.default("INBOX"),
  password: nonEmpty,
  processedMailbox: nonEmpty.default("ARC-Processed"),
  subjectKeyword: nonEmpty.default("boss直聘"),
  username: nonEmpty,
});
export const createManagedMailAccountSchema = createMailAccountSchema.extend({ userId: nonEmpty });
export const updateMailAccountSchema = createMailAccountSchema
  .omit({ password: true })
  .partial()
  .extend({ password: nonEmpty.optional() });
export const mailMessagesQuerySchema = z.object({
  jdBindStatus: z.enum(["bound", "unmatched", "ambiguous", "fallback"]).optional(),
  keyword: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  receivedFrom: z.iso.datetime().optional(),
  receivedTo: z.iso.datetime().optional(),
  skipReason: z.literal("no_supported_attachment").optional(),
  status: z.enum(["processing", "queued", "skipped", "failed"]).optional(),
  textFilters: listTextFiltersSchema("mailLogs"),
});
export const mailAccountSchema = z.object({
  createdAt: z.iso.datetime(),
  emailAddress: z.email(),
  enabled: z.boolean(),
  failedMailbox: z.string(),
  hasPassword: z.boolean(),
  id: z.string(),
  imapHost: z.string(),
  imapPort: z.number().int(),
  imapSecure: z.boolean(),
  lastCheckedAt: z.iso.datetime().nullable(),
  lastError: z.string().nullable(),
  listenStartAt: z.iso.datetime().nullable(),
  mailbox: z.string(),
  processedMailbox: z.string(),
  subjectKeyword: z.string(),
  updatedAt: z.iso.datetime(),
  username: z.string(),
});
export const mailAccountListSchema = z.object({ accounts: z.array(mailAccountSchema) });
export const workspaceMailAccountSchema = z.object({
  account: mailAccountSchema.nullable(),
  lastRunFailed: z.number().int().nullable(),
  lastRunMatched: z.number().int().nullable(),
  lastRunQueued: z.number().int().nullable(),
  lastRunReceived: z.number().int().nullable(),
  lastRunSubjectSkipped: z.number().int().nullable(),
  messageCount: z.number().int().nonnegative(),
  problemCount: z.number().int().nonnegative(),
  user: z.object({
    email: z.email(),
    id: z.string(),
    image: z.string().nullable(),
    name: z.string(),
    role: z.string(),
  }),
});
export const managedMailListSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  records: z.array(workspaceMailAccountSchema),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export const mailDeleteSchema = z.object({ ok: z.literal(true) });
export const mailPollResponseSchema = z.object({ status: z.literal("queued") });
const attachmentSchema = z.object({
  fileName: z.string(),
  hasDuplicate: z.boolean(),
  poolItemId: z.string().nullable(),
  resumeParseError: z.string().nullable(),
  resumeParseStatus: z.enum(["unparsed", "queued", "processing", "ready", "failed"]).nullable(),
  resumeRecordId: z.string().nullable(),
});
export const mailMessagesResponseSchema = z.object({
  records: z.array(
    z.object({
      attachmentCount: z.number().int().nullable(),
      attachments: z.array(attachmentSchema),
      boundJobDescriptionName: z.string().nullable(),
      errorMessage: z.string().nullable(),
      fromAddress: z.string().nullable(),
      id: z.string(),
      jdBindStatus: z.enum(["bound", "unmatched", "ambiguous", "fallback"]).nullable(),
      poolSummary: z.enum(["all_failed", "all_pooled", "parsing", "partial_failed"]).nullable(),
      receivedAt: z.iso.datetime().nullable(),
      resumeAttachmentCount: z.number().int().nullable(),
      skipReason: z.literal("no_supported_attachment").nullable(),
      status: z.enum(["processing", "queued", "skipped", "failed"]),
      subject: z.string().nullable(),
    }),
  ),
  total: z.number().int().nonnegative(),
});
