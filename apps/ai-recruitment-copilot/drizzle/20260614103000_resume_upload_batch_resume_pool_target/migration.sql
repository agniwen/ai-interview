ALTER TABLE "resume_upload_batch"
  ADD COLUMN IF NOT EXISTS "target" text DEFAULT 'resume_library' NOT NULL,
  ADD COLUMN IF NOT EXISTS "resume_pool_scope" text;

ALTER TABLE "resume_upload_batch_item"
  ADD COLUMN IF NOT EXISTS "pool_item_id" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'resume_upload_batch_item_pool_item_id_fk'
  ) THEN
    ALTER TABLE "resume_upload_batch_item"
      ADD CONSTRAINT "resume_upload_batch_item_pool_item_id_fk"
      FOREIGN KEY ("pool_item_id") REFERENCES "resume_pool_item"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "resume_upload_batch_target_org_user_created_idx"
  ON "resume_upload_batch" USING btree ("target", "organization_id", "created_by", "created_at");

CREATE INDEX IF NOT EXISTS "resume_upload_batch_item_pool_item_idx"
  ON "resume_upload_batch_item" USING btree ("pool_item_id");
