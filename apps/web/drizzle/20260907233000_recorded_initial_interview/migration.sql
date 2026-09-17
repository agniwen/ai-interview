CREATE TABLE "recruiting_initial_interview" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"recruiting_record_id" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruiting_initial_interview_version" (
	"id" text PRIMARY KEY,
	"initial_interview_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"recruiting_record_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"transcript" jsonb NOT NULL,
	"roles" jsonb DEFAULT '{}' NOT NULL,
	"evaluation" jsonb,
	"overwrite_document_id" text,
	"document_id" text,
	"document_url" text,
	"error" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "recruiting_initial_version_status_check" CHECK ("status" IN ('queued', 'identifying', 'needs_speakers', 'generating', 'ready', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "recruiting_node_state" ADD COLUMN "effective_initial_interview_version_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_initial_interview_owner_uq" ON "recruiting_initial_interview" ("id","recruiting_record_id","organization_id");--> statement-breakpoint
CREATE INDEX "recruiting_initial_interview_record_idx" ON "recruiting_initial_interview" ("organization_id","recruiting_record_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_initial_version_owner_uq" ON "recruiting_initial_interview_version" ("id","recruiting_record_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_initial_version_number_uq" ON "recruiting_initial_interview_version" ("initial_interview_id","version");--> statement-breakpoint
CREATE INDEX "recruiting_initial_version_pending_idx" ON "recruiting_initial_interview_version" ("status","updated_at");--> statement-breakpoint
ALTER TABLE "recruiting_initial_interview" ADD CONSTRAINT "recruiting_initial_interview_record_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recruiting_initial_interview" ADD CONSTRAINT "recruiting_initial_interview_creator_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "recruiting_initial_interview_version" ADD CONSTRAINT "recruiting_initial_version_snapshot_fk" FOREIGN KEY ("initial_interview_id","recruiting_record_id","organization_id") REFERENCES "recruiting_initial_interview"("id","recruiting_record_id","organization_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recruiting_initial_interview_version" ADD CONSTRAINT "recruiting_initial_version_creator_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "recruiting_node_state" ADD CONSTRAINT "recruiting_node_initial_interview_owner_fk" FOREIGN KEY ("effective_initial_interview_version_id","recruiting_record_id","organization_id") REFERENCES "recruiting_initial_interview_version"("id","recruiting_record_id","organization_id");--> statement-breakpoint
ALTER TABLE "recruiting_node_state" DROP CONSTRAINT "recruiting_node_evidence_check", ADD CONSTRAINT "recruiting_node_evidence_check" CHECK (("effective_ai_round_id" IS NULL OR "node" = 'ai_interview') AND ("effective_initial_interview_version_id" IS NULL OR ("node" = 'ai_interview' AND "effective_ai_round_id" IS NULL)) AND ("effective_human_round_id" IS NULL OR "node" IN ('second_interview', 'final_interview')) AND ("effective_offer_id" IS NULL OR "node" = 'offer'));--> statement-breakpoint
ALTER TABLE "recruiting_node_state" DROP CONSTRAINT "recruiting_node_inactive_check", ADD CONSTRAINT "recruiting_node_inactive_check" CHECK ("status" NOT IN ('inactive', 'skipped') OR ("effective_ai_round_id" IS NULL AND "effective_initial_interview_version_id" IS NULL AND "effective_human_round_id" IS NULL AND "effective_offer_id" IS NULL));