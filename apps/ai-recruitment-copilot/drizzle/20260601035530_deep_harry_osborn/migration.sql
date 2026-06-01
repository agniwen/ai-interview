CREATE SCHEMA IF NOT EXISTS "mastra";--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD COLUMN "agent_state" jsonb DEFAULT '{}' NOT NULL;
