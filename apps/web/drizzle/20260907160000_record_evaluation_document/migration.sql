CREATE TABLE IF NOT EXISTS "recruiting_evaluation_document" (
  "recruiting_record_id" text PRIMARY KEY,
  "organization_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "document_id" text,
  "document_url" text,
  "status" text NOT NULL DEFAULT 'creating',
  "initialization" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "recruiting_evaluation_document_record_org_fk" FOREIGN KEY ("recruiting_record_id", "organization_id") REFERENCES "recruiting_record"("id", "organization_id") ON DELETE CASCADE,
  CONSTRAINT "recruiting_evaluation_document_status_check" CHECK ("status" IN ('creating', 'ready'))
);

-- Event deliveries are deduplicated by event/channel/recipient and provider request
-- key. Do not let the legacy recipient index collide with a new event for a migrated report.
DROP INDEX IF EXISTS recruiting_notification_delivery_once_uq;
CREATE UNIQUE INDEX recruiting_notification_delivery_once_uq ON recruiting_notification_delivery
  (recruiting_record_id, conversation_id, type, recipient_user_id, provider_id)
  WHERE event_id IS NULL;

-- A document already containing human feedback wins. Otherwise retain the latest
-- generated document; older documents remain reachable through historical deliveries.
DO $$ BEGIN
  IF EXISTS (
    SELECT r.recruiting_record_id FROM human_interview_evaluation_document_sync s
    JOIN human_interview_round r ON r.id = s.round_id AND r.organization_id = s.organization_id
    WHERE s.document_id IS NOT NULL
    GROUP BY r.recruiting_record_id HAVING count(DISTINCT s.document_id) > 1
  ) THEN RAISE EXCEPTION 'human evaluations already use multiple documents; manual content reconciliation required'; END IF;
END $$;

INSERT INTO recruiting_evaluation_document (recruiting_record_id, organization_id, provider_id, document_id, document_url, status)
SELECT DISTINCT ON (recruiting_record_id) recruiting_record_id, organization_id, provider_id, document_id, document_url, 'ready'
FROM (
  SELECT r.recruiting_record_id, s.organization_id, s.provider_id, s.document_id, s.document_url, 0 AS priority, s.created_at AS at
  FROM human_interview_evaluation_document_sync s JOIN human_interview_round r ON r.id = s.round_id AND r.organization_id = s.organization_id
  WHERE s.document_id IS NOT NULL AND s.document_url IS NOT NULL AND s.provider_id IN ('feishu', 'feishu-jiguang-hr')
  UNION ALL
  SELECT recruiting_record_id, organization_id, provider_id,
    coalesce(nullif(feishu_document_id, ''), substring(feishu_document_url FROM '/docx/([A-Za-z0-9_-]+)')),
    feishu_document_url, 1, updated_at
  FROM recruiting_notification_delivery
  WHERE feishu_document_url IS NOT NULL AND provider_id IN ('feishu', 'feishu-jiguang-hr')
) candidates WHERE document_id IS NOT NULL
ORDER BY recruiting_record_id, priority, at DESC, document_id
ON CONFLICT DO NOTHING;


-- Submission is the source of truth; repair missing outbox rows without resending notifications.
INSERT INTO human_interview_evaluation_document_sync (snapshot_id, round_id, organization_id)
SELECT DISTINCT ON (round_id) id, round_id, organization_id
FROM human_interview_evaluation_snapshot WHERE source = 'human_submitted'
ORDER BY round_id, created_at DESC, id DESC
ON CONFLICT DO NOTHING;
