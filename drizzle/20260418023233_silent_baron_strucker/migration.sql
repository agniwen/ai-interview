CREATE TABLE "chat_conversation" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"is_title_generating" boolean DEFAULT false NOT NULL,
	"job_description" text DEFAULT '' NOT NULL,
	"resume_imports" jsonb DEFAULT '{}' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message" (
	"content" jsonb NOT NULL,
	"conversation_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"role" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "chat_conversation_user_id_idx" ON "chat_conversation" ("user_id");--> statement-breakpoint
CREATE INDEX "chat_conversation_user_updated_idx" ON "chat_conversation" ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "chat_message_conversation_idx" ON "chat_message" ("conversation_id","created_at");--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD CONSTRAINT "chat_conversation_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_conversation_id_chat_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversation"("id") ON DELETE CASCADE;
