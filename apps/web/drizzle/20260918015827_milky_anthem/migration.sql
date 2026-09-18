CREATE TABLE "human_transcription_event" (
	"event_id" text NOT NULL,
	"event_seq" integer NOT NULL,
	"generation" integer NOT NULL,
	"id" text PRIMARY KEY,
	"payload" jsonb NOT NULL,
	"run_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "human_transcription_event_alias" (
	"run_id" text,
	"generation" integer,
	"event_id" text,
	"canonical_event_id" text NOT NULL,
	CONSTRAINT "human_transcription_event_alias_pkey" PRIMARY KEY("run_id","generation","event_id")
);
--> statement-breakpoint
CREATE TABLE "human_transcription_run" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatch_id" text,
	"ended_at" timestamp with time zone,
	"event_seq" integer DEFAULT 0 NOT NULL,
	"execution_id" text,
	"generation" integer DEFAULT 1 NOT NULL,
	"heartbeat_at" timestamp with time zone,
	"id" text PRIMARY KEY,
	"meeting_id" text NOT NULL,
	"mode" text NOT NULL,
	"organization_id" text NOT NULL,
	"participants" jsonb NOT NULL,
	"room_name" text NOT NULL,
	"started_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	CONSTRAINT "human_transcription_run_mode_check" CHECK ("mode" in ('shadow', 'server_realtime')),
	CONSTRAINT "human_transcription_run_generation_check" CHECK ("generation" > 0),
	CONSTRAINT "human_transcription_run_status_check" CHECK ("status" in ('pending','starting','capturing','finalizing','ready','recovering','needs_review','failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "human_transcription_event_identity_uq" ON "human_transcription_event" ("run_id","generation","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "human_transcription_event_sentence_revision_uq" ON "human_transcription_event" ("run_id","generation",("payload"->>'streamEpoch'),("payload"->>'providerTaskId'),("payload"->>'itemId'),("payload"->>'revision')) WHERE "payload"->>'kind' = 'final';--> statement-breakpoint
CREATE UNIQUE INDEX "human_transcription_event_cursor_uq" ON "human_transcription_event" ("run_id","event_seq");--> statement-breakpoint
CREATE UNIQUE INDEX "human_transcription_run_meeting_active_uq" ON "human_transcription_run" ("meeting_id") WHERE "status" in ('pending','starting','capturing','finalizing','recovering');--> statement-breakpoint
CREATE INDEX "human_transcription_run_reconcile_idx" ON "human_transcription_run" ("status","heartbeat_at");--> statement-breakpoint
ALTER TABLE "human_transcription_event" ADD CONSTRAINT "human_transcription_event_5Eoeb055aYd0_fkey" FOREIGN KEY ("run_id") REFERENCES "human_transcription_run"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "human_transcription_event_alias" ADD CONSTRAINT "human_transcription_event_alias_canonical_fk" FOREIGN KEY ("run_id","generation","canonical_event_id") REFERENCES "human_transcription_event"("run_id","generation","event_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "human_transcription_run" ADD CONSTRAINT "human_transcription_run_SYWDVnpeMf0K_fkey" FOREIGN KEY ("meeting_id") REFERENCES "human_interview_meeting"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "human_transcription_run" ADD CONSTRAINT "human_transcription_run_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;