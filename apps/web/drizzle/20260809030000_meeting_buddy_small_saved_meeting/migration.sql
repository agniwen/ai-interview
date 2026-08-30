CREATE TABLE "meeting_session" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"manifest_sha256" text NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_session_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "meeting_session_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "meeting_session_org_owner_saved_idx" ON "meeting_session" USING btree ("organization_id", "owner_id", "saved_at");
--> statement-breakpoint
CREATE TABLE "meeting_recording_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"track" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"fragment_count" integer NOT NULL,
	"sha256" text NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_recording_asset_meeting_id_meeting_session_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting_session"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "meeting_recording_asset_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_recording_asset_meeting_track_uq" ON "meeting_recording_asset" USING btree ("meeting_id", "track");
--> statement-breakpoint
CREATE INDEX "meeting_recording_asset_meeting_idx" ON "meeting_recording_asset" USING btree ("meeting_id");
