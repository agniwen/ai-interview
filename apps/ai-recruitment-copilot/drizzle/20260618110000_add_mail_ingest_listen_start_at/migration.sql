ALTER TABLE "mail_ingest_account"
  ADD COLUMN IF NOT EXISTS "listen_start_at" timestamp with time zone;
