import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { enqueueResumeParseJobs } from "@arc/resume-parse-queue/resume-parse";
import { buildAttachmentKeyByHash, putObjectBytes } from "@app/server/lib/server/s3";
import {
  claimMailIngestAccount,
  claimMailIngestMessageForProcessing,
  finishMailIngestAccountRun,
  listEnabledMailIngestAccounts,
  markMailIngestMessageSkipped,
  updateMailIngestMessageResult,
} from "@app/server/server/routes/studio/routes/mail-ingest/dao";
import { fetchPublishedJobDescriptionsByCodes } from "@app/server/server/routes/studio/routes/job-descriptions/dao";
import {
  insertBatchWithItems,
  loadBatchDetail,
} from "@app/server/server/routes/studio/routes/resume-upload-batches/dao/batches";
import { createMailIngestProcessor } from "./processor";
import type { ImapClient, MailIngestDependencies } from "./processor";

const productionMailIngestDependencies = {
  buildAttachmentKeyByHash,
  claimMailIngestAccount,
  claimMailIngestMessageForProcessing,
  createImapClient: (options: ConstructorParameters<typeof ImapFlow>[0]): ImapClient =>
    new ImapFlow(options),
  enqueueResumeParseJobs,
  fetchPublishedJobDescriptionsByCodes,
  finishMailIngestAccountRun,
  insertBatchWithItems,
  listEnabledMailIngestAccounts,
  loadBatchDetail,
  markMailIngestMessageSkipped,
  parseMail: simpleParser,
  putObjectBytes,
  updateMailIngestMessageResult,
} satisfies MailIngestDependencies;

export const { runMailIngestOnce } = createMailIngestProcessor(productionMailIngestDependencies);
