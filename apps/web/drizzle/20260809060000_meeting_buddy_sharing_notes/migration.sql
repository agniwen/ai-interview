ALTER TABLE "meeting_session" ADD COLUMN "custodian_id" text;
ALTER TABLE "meeting_session" ADD COLUMN "visibility" text DEFAULT 'restricted' NOT NULL;
ALTER TABLE "meeting_session" ADD CONSTRAINT "meeting_session_visibility_check" CHECK ("visibility" in ('restricted', 'workspace'));

CREATE TABLE "meeting_access_grant" (
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text,
  "id" text PRIMARY KEY NOT NULL,
  "member_id" text NOT NULL,
  "meeting_id" text NOT NULL,
  "organization_id" text NOT NULL,
  "role" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "meeting_access_grant_role_check" CHECK ("role" in ('editor', 'viewer'))
);

CREATE TABLE "meeting_note" (
  "author_id" text,
  "author_name" text NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "id" text PRIMARY KEY NOT NULL,
  "meeting_id" text NOT NULL,
  "meeting_time_ms" integer NOT NULL,
  "organization_id" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "meeting_note_time_check" CHECK ("meeting_time_ms" >= 0)
);

CREATE TABLE "meeting_audit_log" (
  "action" text NOT NULL,
  "actor_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "id" text PRIMARY KEY NOT NULL,
  "meeting_id" text,
  "organization_id" text NOT NULL
);

ALTER TABLE "meeting_access_grant" ADD CONSTRAINT "meeting_access_grant_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null;
ALTER TABLE "meeting_access_grant" ADD CONSTRAINT "meeting_access_grant_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade;
ALTER TABLE "meeting_session" ADD CONSTRAINT "meeting_session_custodian_id_user_id_fk" FOREIGN KEY ("custodian_id") REFERENCES "public"."user"("id") ON DELETE set null;
ALTER TABLE "meeting_access_grant" ADD CONSTRAINT "meeting_access_grant_meeting_id_meeting_session_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting_session"("id") ON DELETE cascade;
ALTER TABLE "meeting_access_grant" ADD CONSTRAINT "meeting_access_grant_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade;
ALTER TABLE "meeting_note" ADD CONSTRAINT "meeting_note_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null;
ALTER TABLE "meeting_note" ADD CONSTRAINT "meeting_note_meeting_id_meeting_session_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting_session"("id") ON DELETE cascade;
ALTER TABLE "meeting_note" ADD CONSTRAINT "meeting_note_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade;
ALTER TABLE "meeting_audit_log" ADD CONSTRAINT "meeting_audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null;
ALTER TABLE "meeting_audit_log" ADD CONSTRAINT "meeting_audit_log_meeting_id_meeting_session_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting_session"("id") ON DELETE set null;
ALTER TABLE "meeting_audit_log" ADD CONSTRAINT "meeting_audit_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade;

CREATE UNIQUE INDEX "meeting_access_grant_meeting_member_uq" ON "meeting_access_grant" USING btree ("meeting_id", "member_id");
CREATE INDEX "meeting_access_grant_org_member_idx" ON "meeting_access_grant" USING btree ("organization_id", "member_id");
CREATE INDEX "meeting_note_meeting_time_idx" ON "meeting_note" USING btree ("meeting_id", "meeting_time_ms");
CREATE INDEX "meeting_note_org_author_idx" ON "meeting_note" USING btree ("organization_id", "author_id");
CREATE INDEX "meeting_audit_log_meeting_created_idx" ON "meeting_audit_log" USING btree ("meeting_id", "created_at");
CREATE INDEX "meeting_audit_log_org_created_idx" ON "meeting_audit_log" USING btree ("organization_id", "created_at");
