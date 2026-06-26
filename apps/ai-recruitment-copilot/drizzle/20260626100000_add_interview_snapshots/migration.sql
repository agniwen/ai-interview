CREATE TABLE "interview_context_snapshot" (
  "id" text PRIMARY KEY NOT NULL,
  "content_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text,
  "interview_record_id" text NOT NULL,
  "organization_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "reason" text NOT NULL,
  "schedule_entry_id" text,
  "status" text DEFAULT 'active' NOT NULL,
  "superseded_at" timestamp with time zone,
  "version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_evidence_snapshot" (
  "id" text PRIMARY KEY NOT NULL,
  "content_hash" text NOT NULL,
  "context_snapshot_id" text NOT NULL,
  "conversation_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "interview_record_id" text NOT NULL,
  "organization_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "schedule_entry_id" text
);
--> statement-breakpoint
ALTER TABLE "interview_context_snapshot"
ADD CONSTRAINT "interview_context_snapshot_created_by_user_id_fk"
FOREIGN KEY ("created_by") REFERENCES "public"."user"("id")
ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "interview_context_snapshot"
ADD CONSTRAINT "interview_context_snapshot_interview_record_id_studio_interview_id_fk"
FOREIGN KEY ("interview_record_id") REFERENCES "public"."studio_interview"("id")
ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "interview_context_snapshot"
ADD CONSTRAINT "interview_context_snapshot_organization_id_organization_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "interview_context_snapshot"
ADD CONSTRAINT "interview_context_snapshot_schedule_entry_id_studio_interview_schedule_id_fk"
FOREIGN KEY ("schedule_entry_id") REFERENCES "public"."studio_interview_schedule"("id")
ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "interview_evidence_snapshot"
ADD CONSTRAINT "interview_evidence_snapshot_context_snapshot_id_interview_context_snapshot_id_fk"
FOREIGN KEY ("context_snapshot_id") REFERENCES "public"."interview_context_snapshot"("id")
ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "interview_evidence_snapshot"
ADD CONSTRAINT "interview_evidence_snapshot_conversation_id_interview_conversation_conversation_id_fk"
FOREIGN KEY ("conversation_id") REFERENCES "public"."interview_conversation"("conversation_id")
ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "interview_evidence_snapshot"
ADD CONSTRAINT "interview_evidence_snapshot_interview_record_id_studio_interview_id_fk"
FOREIGN KEY ("interview_record_id") REFERENCES "public"."studio_interview"("id")
ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "interview_evidence_snapshot"
ADD CONSTRAINT "interview_evidence_snapshot_organization_id_organization_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "interview_evidence_snapshot"
ADD CONSTRAINT "interview_evidence_snapshot_schedule_entry_id_studio_interview_schedule_id_fk"
FOREIGN KEY ("schedule_entry_id") REFERENCES "public"."studio_interview_schedule"("id")
ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "interview_context_snapshot_record_version_uq"
ON "interview_context_snapshot" USING btree ("interview_record_id", "version");
--> statement-breakpoint
CREATE INDEX "interview_context_snapshot_record_status_idx"
ON "interview_context_snapshot" USING btree ("interview_record_id", "status");
--> statement-breakpoint
CREATE INDEX "interview_context_snapshot_round_idx"
ON "interview_context_snapshot" USING btree ("schedule_entry_id");
--> statement-breakpoint
CREATE INDEX "interview_context_snapshot_organization_idx"
ON "interview_context_snapshot" USING btree ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "interview_evidence_snapshot_conversation_hash_uq"
ON "interview_evidence_snapshot" USING btree ("conversation_id", "content_hash");
--> statement-breakpoint
CREATE INDEX "interview_evidence_snapshot_record_idx"
ON "interview_evidence_snapshot" USING btree ("interview_record_id");
--> statement-breakpoint
CREATE INDEX "interview_evidence_snapshot_round_idx"
ON "interview_evidence_snapshot" USING btree ("schedule_entry_id");
--> statement-breakpoint
CREATE INDEX "interview_evidence_snapshot_context_idx"
ON "interview_evidence_snapshot" USING btree ("context_snapshot_id");
--> statement-breakpoint
CREATE INDEX "interview_evidence_snapshot_organization_idx"
ON "interview_evidence_snapshot" USING btree ("organization_id");
