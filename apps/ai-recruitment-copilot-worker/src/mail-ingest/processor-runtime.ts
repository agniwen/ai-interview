import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { enqueueResumeParseJobs } from "@arc/resume-parse-queue/resume-parse";
import {
  buildAttachmentKeyByHash,
  putObjectBytes,
} from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import {
  claimMailIngestAccount,
  claimMailIngestMessageForProcessing,
  finishMailIngestAccountRun,
  listEnabledMailIngestAccounts,
  markMailIngestMessageSkipped,
  updateMailIngestMessageResult,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/mail-ingest/dao";
import { fetchPublishedJobDescriptionsByCodes } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import {
  insertBatchWithItems,
  loadBatchDetail,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-upload-batches/dao/batches";
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
