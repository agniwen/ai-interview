-- Preserve every delivery identity, external message, status and historical document.
-- The old archive is intentionally untouched. This ledger permits scoped reversal.
CREATE SCHEMA IF NOT EXISTS recruiting_maintenance;
CREATE TABLE IF NOT EXISTS recruiting_maintenance."evaluation_document_notification_backup" (
  "delivery_id" text PRIMARY KEY,
  "original_row" jsonb NOT NULL,
  "backed_up_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM recruiting_notification_delivery a
    JOIN recruiting_notification_delivery b ON a.recruiting_record_id = b.recruiting_record_id
      AND a.conversation_id = b.conversation_id AND a.recipient_user_id = b.recipient_user_id
      AND a.provider_id = b.provider_id
    WHERE a.type = 'summary_ready' AND b.type = 'ai_report_ready' AND a.event_id IS NULL AND b.event_id IS NULL
  ) THEN RAISE EXCEPTION 'notification type migration has identity conflicts; reconcile explicitly'; END IF;
  IF EXISTS (
    SELECT r.recruiting_record_id FROM human_interview_evaluation_document_sync s
    JOIN human_interview_round r ON r.id = s.round_id AND r.organization_id = s.organization_id
    WHERE s.document_id IS NOT NULL
    GROUP BY r.recruiting_record_id HAVING count(DISTINCT s.document_id) > 1
  ) THEN RAISE EXCEPTION 'human evaluations already use multiple documents; manual content reconciliation required'; END IF;
END $$;

INSERT INTO recruiting_maintenance.evaluation_document_notification_backup (delivery_id, original_row)
SELECT id, to_jsonb(d) FROM recruiting_notification_delivery d WHERE type = 'summary_ready'
ON CONFLICT DO NOTHING;


UPDATE recruiting_notification_delivery SET type = 'ai_report_ready' WHERE type = 'summary_ready';
