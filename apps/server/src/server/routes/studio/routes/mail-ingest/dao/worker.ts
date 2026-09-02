import { createMailIngestDao } from "@app/resume-processing/mail-ingest";
import { decryptMailIngestSecret } from "@app/resume-processing/mail-ingest-crypto";
import { db } from "@server/lib/server/db/index";

export const mailIngestWorkerDao = createMailIngestDao(db, {
  decryptSecret: decryptMailIngestSecret,
});
