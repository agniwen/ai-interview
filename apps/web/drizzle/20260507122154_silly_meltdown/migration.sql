ALTER TABLE "chat_attachment" ADD COLUMN "parsed_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat_attachment" ADD COLUMN "parsed_error" text;--> statement-breakpoint
ALTER TABLE "chat_attachment" ADD COLUMN "parsed_page_count" integer;--> statement-breakpoint
ALTER TABLE "chat_attachment" ADD COLUMN "parsed_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_attachment" ADD COLUMN "parsed_structured" jsonb;--> statement-breakpoint
ALTER TABLE "chat_attachment" ADD COLUMN "parsed_text" text;--> statement-breakpoint
ALTER TABLE "chat_attachment" ADD COLUMN "parsed_text_source" text;