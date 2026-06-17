import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);

export const createMailIngestAccountSchema = z.object({
  emailAddress: nonEmptyString.email(),
  enabled: z.boolean().default(true),
  failedMailbox: nonEmptyString.default("ARC-Failed"),
  imapHost: nonEmptyString.default("imap.qiye.aliyun.com"),
  imapPort: z.number().int().min(1).max(65_535).default(993),
  imapSecure: z.boolean().default(true),
  mailbox: nonEmptyString.default("INBOX"),
  password: nonEmptyString,
  processedMailbox: nonEmptyString.default("ARC-Processed"),
  subjectKeyword: nonEmptyString.default("boss直聘"),
  username: nonEmptyString,
});

export const updateMailIngestAccountSchema = createMailIngestAccountSchema
  .omit({ password: true })
  .partial()
  .extend({
    password: nonEmptyString.optional(),
  });
