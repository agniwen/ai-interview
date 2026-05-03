CREATE TABLE "chat_attachment" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"filename" text NOT NULL,
	"id" text PRIMARY KEY,
	"media_type" text NOT NULL,
	"size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "chat_attachment_user_id_idx" ON "chat_attachment" ("user_id");--> statement-breakpoint
ALTER TABLE "chat_attachment" ADD CONSTRAINT "chat_attachment_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;