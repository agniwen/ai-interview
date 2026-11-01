CREATE TABLE "recruiting_offer_approval" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"recruiting_record_id" text NOT NULL,
	"offer_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"content_revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"snapshot_hash" text NOT NULL,
	"applicant_id" text NOT NULL,
	"applicant_name" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"previous_approval_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"invalidation_reason" text,
	"withdrawal_reason" text,
	"last_reminded_at" timestamp with time zone,
	CONSTRAINT "offer_approval_status_ck" CHECK ("status" IN ('pending','approved','rejected','withdrawn','cancelled')),
	CONSTRAINT "offer_approval_numbers_ck" CHECK ("attempt_number" > 0 AND "content_revision" > 0 AND "current_step" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recruiting_offer_approval_receipt" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"request_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"approval_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruiting_offer_approval_step" (
	"id" text PRIMARY KEY,
	"approval_id" text NOT NULL,
	"recruiting_record_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"position" integer NOT NULL,
	"approver_id" text NOT NULL,
	"approver_name" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"activated_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"comment" text,
	CONSTRAINT "offer_approval_step_status_ck" CHECK ("status" IN ('waiting','pending','approved','rejected','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "recruiting_offer" ADD COLUMN "content_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "recruiting_offer" ADD COLUMN "current_approval_id" text;--> statement-breakpoint
ALTER TABLE "recruiting_offer" ADD COLUMN "published_approval_id" text;--> statement-breakpoint
ALTER TABLE "recruiting_offer" ADD COLUMN "published_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "recruiting_record" ADD COLUMN "offer_approval_required_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "offer_approval_owner_uq" ON "recruiting_offer_approval" ("id","recruiting_record_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_approval_attempt_uq" ON "recruiting_offer_approval" ("recruiting_record_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_approval_pending_uq" ON "recruiting_offer_approval" ("recruiting_record_id") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "offer_approval_org_created_idx" ON "recruiting_offer_approval" ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_approval_receipt_key_uq" ON "recruiting_offer_approval_receipt" ("organization_id","actor_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_approval_step_position_uq" ON "recruiting_offer_approval_step" ("approval_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_approval_step_person_uq" ON "recruiting_offer_approval_step" ("approval_id","approver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_approval_step_pending_uq" ON "recruiting_offer_approval_step" ("approval_id") WHERE "status" = 'pending';--> statement-breakpoint
ALTER TABLE "recruiting_offer_approval" ADD CONSTRAINT "recruiting_offer_approval_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recruiting_offer_approval" ADD CONSTRAINT "offer_approval_offer_owner_fk" FOREIGN KEY ("offer_id","recruiting_record_id","organization_id") REFERENCES "recruiting_offer"("id","recruiting_record_id","organization_id");--> statement-breakpoint
ALTER TABLE "recruiting_offer_approval_receipt" ADD CONSTRAINT "recruiting_offer_approval_receipt_ig9m1thFXXyy_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recruiting_offer_approval_receipt" ADD CONSTRAINT "recruiting_offer_approval_receipt_QPpF0iAgCvJI_fkey" FOREIGN KEY ("approval_id") REFERENCES "recruiting_offer_approval"("id");--> statement-breakpoint
ALTER TABLE "recruiting_offer_approval_step" ADD CONSTRAINT "recruiting_offer_approval_step_6Z3TMFDUJ56G_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recruiting_offer_approval_step" ADD CONSTRAINT "offer_approval_step_owner_fk" FOREIGN KEY ("approval_id","recruiting_record_id","organization_id") REFERENCES "recruiting_offer_approval"("id","recruiting_record_id","organization_id");--> statement-breakpoint
ALTER TABLE "recruiting_notification_event" DROP CONSTRAINT "recruiting_notification_event_scope_check", ADD CONSTRAINT "recruiting_notification_event_scope_check" CHECK ((
        ("scope_type" = 'offer_approval' AND "recruiting_record_id" IS NOT NULL) OR ("scope_type" = 'interview_record' AND "recruiting_record_id" IS NOT NULL)
        OR ("scope_type" = 'ai_round' AND "ai_round_id" IS NOT NULL)
        OR ("scope_type" = 'human_meeting' AND "human_meeting_id" IS NOT NULL)
      ));