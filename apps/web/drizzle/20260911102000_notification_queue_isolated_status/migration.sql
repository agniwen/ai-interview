ALTER TABLE "recruiting_notification_event"
  DROP CONSTRAINT "recruiting_notification_event_status_check";
--> statement-breakpoint
ALTER TABLE "recruiting_notification_event"
  ADD CONSTRAINT "recruiting_notification_event_status_check"
  CHECK ("status" IN (
    'pending', 'processing', 'completed', 'failed', 'dead', 'cancelled',
    'isolated_pending', 'isolated_processing', 'isolated_completed',
    'isolated_failed', 'isolated_dead'
  ));
