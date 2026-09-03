CREATE TABLE "minimax_voice_preview" (
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"format" text NOT NULL,
	"id" text PRIMARY KEY,
	"model" text NOT NULL,
	"preview_text" text NOT NULL,
	"preview_text_hash" text NOT NULL,
	"public_url" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voice" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "minimax_voice_preview_unique_idx" ON "minimax_voice_preview" ("voice","preview_text_hash","model","format");
--> statement-breakpoint
CREATE INDEX "minimax_voice_preview_voice_idx" ON "minimax_voice_preview" ("voice");
