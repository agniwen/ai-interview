CREATE TABLE "candidate_material" (
	"category" text DEFAULT 'other' NOT NULL,
	"content_hash" text,
	"content_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"file_name" text,
	"id" text PRIMARY KEY,
	"kind" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"organization_id" text NOT NULL,
	"owner_type" text NOT NULL,
	"recruiting_record_id" text,
	"resume_pool_item_id" text,
	"size_bytes" bigint,
	"storage_key" text,
	"title" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"url" text,
	CONSTRAINT "candidate_material_owner_check" CHECK ((
        ("owner_type" = 'resume_pool_item' AND "resume_pool_item_id" IS NOT NULL AND "recruiting_record_id" IS NULL)
        OR ("owner_type" = 'recruiting_record' AND "recruiting_record_id" IS NOT NULL AND "resume_pool_item_id" IS NULL)
      )),
	CONSTRAINT "candidate_material_kind_payload_check" CHECK ((
        ("kind" = 'file' AND "url" IS NULL AND "storage_key" IS NOT NULL AND "file_name" IS NOT NULL AND "content_type" IS NOT NULL AND "size_bytes" IS NOT NULL AND "content_hash" IS NOT NULL)
        OR ("kind" = 'link' AND "url" IS NOT NULL AND "storage_key" IS NULL AND "file_name" IS NULL AND "content_type" IS NULL AND "size_bytes" IS NULL AND "content_hash" IS NULL)
      )),
	CONSTRAINT "candidate_material_category_check" CHECK ("category" IN ('portfolio', 'video', 'image', 'archive', 'document', 'other')),
	CONSTRAINT "candidate_material_size_check" CHECK ("size_bytes" IS NULL OR ("size_bytes" >= 0 AND "size_bytes" <= 9007199254740991))
);
--> statement-breakpoint
CREATE INDEX "candidate_material_pool_item_idx" ON "candidate_material" ("organization_id","resume_pool_item_id","created_at");--> statement-breakpoint
CREATE INDEX "candidate_material_recruiting_record_idx" ON "candidate_material" ("organization_id","recruiting_record_id","created_at");--> statement-breakpoint
CREATE INDEX "candidate_material_storage_key_idx" ON "candidate_material" ("storage_key");--> statement-breakpoint
ALTER TABLE "candidate_material" ADD CONSTRAINT "candidate_material_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "candidate_material" ADD CONSTRAINT "candidate_material_resume_pool_item_id_resume_pool_item_id_fkey" FOREIGN KEY ("resume_pool_item_id") REFERENCES "resume_pool_item"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "candidate_material" ADD CONSTRAINT "candidate_material_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "candidate_material" ADD CONSTRAINT "candidate_material_recruiting_record_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;