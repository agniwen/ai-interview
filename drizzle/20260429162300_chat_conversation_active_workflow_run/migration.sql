-- 为 chat_conversation 增加 active_workflow_run_id 列，记录当前活动 Vercel
-- Workflow run；客户端断线重连或刷新页面后可凭该 ID 继续读取流。
-- Add active_workflow_run_id to chat_conversation so the client can reconnect
-- and resume reading the active Vercel Workflow run after a network drop or
-- page refresh. A partial index on non-NULL rows keeps lookups cheap because
-- only the small subset of conversations with an in-flight run is indexed.

ALTER TABLE "chat_conversation"
  ADD COLUMN "active_workflow_run_id" text;
--> statement-breakpoint
CREATE INDEX "chat_conversation_active_run_idx"
  ON "chat_conversation" ("active_workflow_run_id")
  WHERE "active_workflow_run_id" IS NOT NULL;
