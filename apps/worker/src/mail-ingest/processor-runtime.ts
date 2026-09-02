import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { enqueueResumeParseJobs } from "@app/resume-parse-queue/resume-parse";
import { buildAttachmentKeyByHash, putObjectBytes } from "@app/object-storage";
import {
  claimMailIngestAccount,
  claimMailIngestMessageForProcessing,
  fetchPublishedJobDescriptionsByCodes,
  finishMailIngestAccountRun,
  insertBatchWithItems,
  listEnabledMailIngestAccounts,
  loadBatchDetail,
  markMailIngestMessageSkipped,
  updateMailIngestMessageResult,
} from "@app/server/worker/mail-ingest";
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
