ALTER TABLE "recruiting_notification_event"
  ADD COLUMN "queue_namespace" text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
DROP INDEX "recruiting_notification_event_dedupe_uq";
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_notification_event_namespace_dedupe_uq"
  ON "recruiting_notification_event" ("queue_namespace", "dedupe_key");
--> statement-breakpoint
DROP INDEX "recruiting_notification_event_claim_idx";
--> statement-breakpoint
CREATE INDEX "recruiting_notification_event_claim_idx"
  ON "recruiting_notification_event" ("queue_namespace", "status", "next_attempt_at", "available_at");
