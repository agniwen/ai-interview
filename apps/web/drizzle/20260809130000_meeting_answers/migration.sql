CREATE TABLE "meeting_question_thread" (
  "id" text PRIMARY KEY NOT NULL,
  "meeting_id" text NOT NULL,
  "organization_id" text NOT NULL,
  "created_by" text NOT NULL,
  "title" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "meeting_question_thread_meeting_id_fk"
    FOREIGN KEY ("meeting_id") REFERENCES "meeting_session"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_question_thread_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_question_thread_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_question_thread_meeting_org_fk"
    FOREIGN KEY ("meeting_id", "organization_id")
    REFERENCES "meeting_session"("id", "organization_id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "meeting_question_thread_id_meeting_org_uq"
  ON "meeting_question_thread" ("id", "meeting_id", "organization_id");
CREATE INDEX "meeting_question_thread_owner_updated_idx"
  ON "meeting_question_thread" ("organization_id", "created_by", "updated_at");

CREATE TABLE "meeting_question_exchange" (
  "id" text PRIMARY KEY NOT NULL,
  "thread_id" text NOT NULL,
  "meeting_id" text NOT NULL,
  "organization_id" text NOT NULL,
  "created_by" text NOT NULL,
  "request_id" text NOT NULL,
  "sequence" integer NOT NULL,
  "question" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "answer" jsonb,
  "error_code" text,
  "attempt" integer DEFAULT 0 NOT NULL,
  "execution_token" text,
  "lease_expires_at" timestamp with time zone,
  "input_transcript_revision_id" text NOT NULL,
  "input_intelligence_revision_id" text,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "prompt_version" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "answered_at" timestamp with time zone,
  CONSTRAINT "meeting_question_exchange_thread_id_fk"
    FOREIGN KEY ("thread_id") REFERENCES "meeting_question_thread"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_question_exchange_meeting_id_fk"
    FOREIGN KEY ("meeting_id") REFERENCES "meeting_session"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_question_exchange_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_question_exchange_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_question_exchange_input_transcript_revision_id_fk"
    FOREIGN KEY ("input_transcript_revision_id")
    REFERENCES "meeting_transcript_revision"("id") ON DELETE RESTRICT,
  CONSTRAINT "meeting_question_exchange_input_intelligence_revision_id_fk"
    FOREIGN KEY ("input_intelligence_revision_id")
    REFERENCES "meeting_intelligence_revision"("id") ON DELETE SET NULL,
  CONSTRAINT "meeting_question_exchange_thread_meeting_org_fk"
    FOREIGN KEY ("thread_id", "meeting_id", "organization_id")
    REFERENCES "meeting_question_thread"("id", "meeting_id", "organization_id") ON DELETE CASCADE,
  CONSTRAINT "meeting_question_exchange_attempt_check" CHECK ("attempt" >= 0),
  CONSTRAINT "meeting_question_exchange_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "meeting_question_exchange_status_check"
    CHECK ("status" IN ('pending', 'processing', 'ready', 'failed')),
  CONSTRAINT "meeting_question_exchange_answer_check"
    CHECK (("status" = 'ready') = ("answer" IS NOT NULL))
);

CREATE UNIQUE INDEX "meeting_question_exchange_thread_request_uq"
  ON "meeting_question_exchange" ("thread_id", "request_id");
CREATE UNIQUE INDEX "meeting_question_exchange_thread_sequence_uq"
  ON "meeting_question_exchange" ("thread_id", "sequence");
CREATE INDEX "meeting_question_exchange_recovery_idx"
  ON "meeting_question_exchange" ("status", "lease_expires_at");
