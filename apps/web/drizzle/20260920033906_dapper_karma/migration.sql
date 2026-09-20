CREATE TABLE "offer_approval_template" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"id" text PRIMARY KEY,
	"is_default" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"nodes" jsonb NOT NULL,
	"organization_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "offer_approval_template_name_ck" CHECK (length(trim("name")) > 0),
	CONSTRAINT "offer_approval_template_nodes_ck" CHECK (jsonb_array_length("nodes") between 1 and 5)
);
--> statement-breakpoint
DROP INDEX "offer_approval_step_person_uq";--> statement-breakpoint
ALTER TABLE "recruiting_offer_approval" ADD COLUMN "template_id" text;--> statement-breakpoint
ALTER TABLE "recruiting_offer_approval" ADD COLUMN "template_name" text;--> statement-breakpoint
ALTER TABLE "recruiting_offer_approval_step" ADD COLUMN "source_label" text DEFAULT '手动选择' NOT NULL;--> statement-breakpoint
ALTER TABLE "recruiting_offer_approval_step" ADD COLUMN "source_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "recruiting_offer_approval_step" ADD COLUMN "source_type" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "offer_approval_template_org_name_uq" ON "offer_approval_template" ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_approval_template_default_uq" ON "offer_approval_template" ("organization_id") WHERE "is_default" = true;--> statement-breakpoint
CREATE INDEX "offer_approval_template_org_updated_idx" ON "offer_approval_template" ("organization_id","updated_at");--> statement-breakpoint
ALTER TABLE "offer_approval_template" ADD CONSTRAINT "offer_approval_template_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "offer_approval_template" ADD CONSTRAINT "offer_approval_template_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "offer_approval_template" ADD CONSTRAINT "offer_approval_template_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "recruiting_offer_approval_step" ADD CONSTRAINT "offer_approval_step_source_type_ck" CHECK ("source_type" IN ('fixed_member','job_reporting_manager','recruiting_owner','manual'));