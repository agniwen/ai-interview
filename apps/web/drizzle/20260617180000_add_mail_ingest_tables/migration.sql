CREATE TABLE "mail_ingest_account" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "user_id" text NOT NULL,
  "email_address" text NOT NULL,
  "imap_host" text DEFAULT 'imap.qiye.aliyun.com' NOT NULL,
  "imap_port" integer DEFAULT 993 NOT NULL,
  "imap_secure" boolean DEFAULT true NOT NULL,
  "username" text NOT NULL,
  "encrypted_password" text NOT NULL,
  "mailbox" text DEFAULT 'INBOX' NOT NULL,
  "processed_mailbox" text DEFAULT 'ARC-Processed' NOT NULL,
  "failed_mailbox" text DEFAULT 'ARC-Failed' NOT NULL,
  "subject_keyword" text DEFAULT 'boss直聘' NOT NULL,
  "target" text DEFAULT 'resume_pool' NOT NULL,
  "resume_pool_scope" text DEFAULT 'private' NOT NULL,
  "jd_mode" text DEFAULT 'none' NOT NULL,
  "job_description_id" text,
  "dedup_policy" text DEFAULT 'skip' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "polling_started_at" timestamp with time zone,
  "last_checked_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mail_ingest_account_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade,
  CONSTRAINT "mail_ingest_account_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade,
  CONSTRAINT "mail_ingest_account_job_description_id_job_description_id_fk"
    FOREIGN KEY ("job_description_id") REFERENCES "job_description"("id") ON DELETE set null
);

CREATE TABLE "mail_ingest_message" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "mailbox" text NOT NULL,
  "uid_validity" text NOT NULL,
  "uid" text NOT NULL,
  "message_id" text,
  "subject" text,
  "from_address" text,
  "received_at" timestamp with time zone,
  "status" text NOT NULL,
  "batch_id" text,
  "error_message" text,
  "processed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mail_ingest_message_account_id_mail_ingest_account_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "mail_ingest_account"("id") ON DELETE cascade,
  CONSTRAINT "mail_ingest_message_batch_id_resume_upload_batch_id_fk"
    FOREIGN KEY ("batch_id") REFERENCES "resume_upload_batch"("id") ON DELETE set null
);

CREATE UNIQUE INDEX "mail_ingest_account_org_user_email_uq"
  ON "mail_ingest_account" ("organization_id", "user_id", "email_address");
CREATE INDEX "mail_ingest_account_enabled_idx" ON "mail_ingest_account" ("enabled");
CREATE INDEX "mail_ingest_account_org_user_idx"
  ON "mail_ingest_account" ("organization_id", "user_id");

CREATE UNIQUE INDEX "mail_ingest_message_account_mail_uid_uq"
  ON "mail_ingest_message" ("account_id", "mailbox", "uid_validity", "uid");
CREATE INDEX "mail_ingest_message_account_status_created_idx"
  ON "mail_ingest_message" ("account_id", "status", "created_at");
CREATE INDEX "mail_ingest_message_batch_idx" ON "mail_ingest_message" ("batch_id");
