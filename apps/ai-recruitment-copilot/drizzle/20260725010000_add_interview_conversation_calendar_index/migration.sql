CREATE INDEX IF NOT EXISTS "interview_conversation_org_ended_started_idx"
ON "interview_conversation" ("organization_id", "ended_at", "started_at");
