import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const nullableIsoDateTime = z.string().datetime().nullable();

export const createMailIngestAccountSchema = z.object({
  emailAddress: nonEmptyString.email(),
  enabled: z.boolean().default(true),
  failedMailbox: nonEmptyString.default("ARC-Failed"),
  imapHost: nonEmptyString.default("imap.qiye.aliyun.com"),
  imapPort: z.number().int().min(1).max(65_535).default(993),
  imapSecure: z.boolean().default(true),
  listenStartAt: nullableIsoDateTime.optional(),
  mailbox: nonEmptyString.default("INBOX"),
  password: nonEmptyString,
  processedMailbox: nonEmptyString.default("ARC-Processed"),
  subjectKeyword: nonEmptyString.default("boss直聘"),
  username: nonEmptyString,
});

export const createManagedMailIngestAccountSchema = createMailIngestAccountSchema.extend({
  userId: nonEmptyString,
});

export const managedMailIngestAccountListQuerySchema = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
});

export const updateMailIngestAccountSchema = createMailIngestAccountSchema
  .omit({ password: true })
  .partial()
  .extend({
    password: nonEmptyString.optional(),
  });

export const listMailMessagesQuerySchema = z.object({
  jdBindStatus: z.enum(["bound", "unmatched", "ambiguous", "fallback"]).optional(),
  keyword: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  receivedFrom: z.coerce.date().optional(),
  receivedTo: z.coerce.date().optional(),
  skipReason: z.enum(["no_supported_attachment"]).optional(),
  status: z.enum(["processing", "queued", "skipped", "failed"]).optional(),
});
