CREATE TABLE "meeting_purge_tombstone" (
  "meeting_id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "purged_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "meeting_purge_tombstone_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE
);

CREATE INDEX "meeting_purge_tombstone_org_purged_idx"
  ON "meeting_purge_tombstone" ("organization_id", "purged_at");
