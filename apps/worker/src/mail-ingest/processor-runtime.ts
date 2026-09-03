import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { enqueueResumeParseJobs } from "@app/resume-parse-queue/resume-parse";
import { buildAttachmentKeyByHash, putObjectBytes } from "@app/object-storage";
import { createResumeIngest } from "@app/resume-processing/ingest";
import { createMailIngestDao } from "@app/resume-processing/mail-ingest";
import { decryptMailIngestSecret } from "@app/resume-processing/mail-ingest-crypto";
import { db } from "../db";
import { createMailIngestProcessor } from "./processor";
import type { ImapClient, MailIngestDependencies } from "./processor";

const { insertBatchWithItems, loadBatchDetail } = createResumeIngest(db);
const mailIngestDao = createMailIngestDao(db, { decryptSecret: decryptMailIngestSecret });

const productionMailIngestDependencies = {
  buildAttachmentKeyByHash,
  claimMailIngestAccount: mailIngestDao.claimAccount,
  claimMailIngestMessageForProcessing: mailIngestDao.claimMessageForProcessing,
  createImapClient: (options: ConstructorParameters<typeof ImapFlow>[0]): ImapClient =>
    new ImapFlow(options),
  enqueueResumeParseJobs,
  fetchPublishedJobDescriptionsByCodes: mailIngestDao.fetchPublishedJobDescriptionsByCodes,
  finishMailIngestAccountRun: mailIngestDao.finishAccountRun,
  insertBatchWithItems,
  listEnabledMailIngestAccounts: mailIngestDao.listEnabledAccounts,
  loadBatchDetail,
  markMailIngestMessageSkipped: mailIngestDao.markMessageSkipped,
  parseMail: simpleParser,
  putObjectBytes,
  updateMailIngestMessageResult: mailIngestDao.updateMessageResult,
} satisfies MailIngestDependencies;

export const { runMailIngestOnce } = createMailIngestProcessor(productionMailIngestDependencies);
