ALTER TABLE "chat_conversation" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD COLUMN "run_state" jsonb;--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD COLUMN "subject_id" text;--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD COLUMN "subject_kind" text;--> statement-breakpoint
ALTER TABLE "chat_message" ADD COLUMN "author_user_id" text;--> statement-breakpoint
ALTER TABLE "chat_conversation" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "chat_conversation_subject_idx" ON "chat_conversation" ("organization_id","subject_kind","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_conversation_active_subject_uq" ON "chat_conversation" ("organization_id","subject_kind","subject_id") WHERE "subject_kind" IS NOT NULL AND "archived_at" IS NULL;--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD CONSTRAINT "chat_conversation_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_author_user_id_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD CONSTRAINT "chat_conversation_subject_pair_check" CHECK (("subject_kind" IS NULL) = ("subject_id" IS NULL));--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD CONSTRAINT "chat_conversation_owner_check" CHECK (("subject_kind" IS NULL) = ("user_id" IS NOT NULL));