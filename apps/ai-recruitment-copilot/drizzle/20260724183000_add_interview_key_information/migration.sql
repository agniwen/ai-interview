ALTER TABLE "interview_conversation"
ADD COLUMN "key_information" jsonb,
ADD COLUMN "key_information_attempts" integer DEFAULT 0 NOT NULL,
ADD COLUMN "key_information_error" text,
ADD COLUMN "key_information_started_at" timestamp with time zone,
ADD COLUMN "key_information_status" text;

UPDATE "interview_conversation"
SET "key_information_status" = 'ready';

ALTER TABLE "interview_conversation"
ALTER COLUMN "key_information_status" SET DEFAULT 'pending',
ALTER COLUMN "key_information_status" SET NOT NULL;

CREATE INDEX "interview_conversation_key_information_status_idx"
ON "interview_conversation" ("key_information_status");
