CREATE TABLE "account" (
	"access_token" text,
	"access_token_expires_at" timestamp,
	"account_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"id_token" text,
	"password" text,
	"provider_id" text NOT NULL,
	"refresh_token" text,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"updated_at" timestamp NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_form_submission" (
	"answers" jsonb DEFAULT '{}' NOT NULL,
	"id" text PRIMARY KEY,
	"interview_record_id" text NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"template_id" text NOT NULL,
	"version_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_form_template" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"description" text,
	"id" text PRIMARY KEY,
	"scope" text NOT NULL,
	"title" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_form_template_job_description" (
	"job_description_id" text,
	"template_id" text,
	CONSTRAINT "candidate_form_template_job_description_pkey" PRIMARY KEY("template_id","job_description_id")
);
--> statement-breakpoint
CREATE TABLE "candidate_form_template_question" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"display_mode" text NOT NULL,
	"helper_text" text,
	"id" text PRIMARY KEY,
	"label" text NOT NULL,
	"options" jsonb DEFAULT '[]' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"sort_order" integer NOT NULL,
	"template_id" text NOT NULL,
	"type" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_form_template_version" (
	"content_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"snapshot" jsonb NOT NULL,
	"template_id" text NOT NULL,
	"version" integer NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "chat_conversation" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"is_title_generating" boolean DEFAULT false NOT NULL,
	"job_description" text DEFAULT '' NOT NULL,
	"job_description_config" jsonb,
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
CREATE TABLE "chat_state_cache" (
	"cache_key" text,
	"expires_at" timestamp with time zone,
	"key_prefix" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "chat_state_cache_pkey" PRIMARY KEY("key_prefix","cache_key")
);
--> statement-breakpoint
CREATE TABLE "chat_state_lists" (
	"expires_at" timestamp with time zone,
	"key_prefix" text,
	"list_key" text,
	"seq" bigserial,
	"value" text NOT NULL,
	CONSTRAINT "chat_state_lists_pkey" PRIMARY KEY("key_prefix","list_key","seq")
);
--> statement-breakpoint
CREATE TABLE "chat_state_locks" (
	"expires_at" timestamp with time zone NOT NULL,
	"key_prefix" text,
	"thread_id" text,
	"token" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_state_locks_pkey" PRIMARY KEY("key_prefix","thread_id")
);
--> statement-breakpoint
CREATE TABLE "chat_state_queues" (
	"expires_at" timestamp with time zone NOT NULL,
	"key_prefix" text,
	"seq" bigserial,
	"thread_id" text,
	"value" text NOT NULL,
	CONSTRAINT "chat_state_queues_pkey" PRIMARY KEY("key_prefix","thread_id","seq")
);
--> statement-breakpoint
CREATE TABLE "chat_state_subscriptions" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"key_prefix" text,
	"thread_id" text,
	CONSTRAINT "chat_state_subscriptions_pkey" PRIMARY KEY("key_prefix","thread_id")
);
--> statement-breakpoint
CREATE TABLE "department" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"description" text,
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feishu_thread_state" (
	"active_jd_id" text,
	"active_jd_set_at" timestamp,
	"thread_id" text PRIMARY KEY,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_config" (
	"closing_instructions" text DEFAULT '' NOT NULL,
	"company_context" text DEFAULT '' NOT NULL,
	"id" text PRIMARY KEY DEFAULT 'singleton',
	"opening_instructions" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "interview_audit_log" (
	"action" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"detail" jsonb DEFAULT '{}' NOT NULL,
	"id" text PRIMARY KEY,
	"interview_record_id" text NOT NULL,
	"operator_id" text,
	"schedule_entry_id" text
);
--> statement-breakpoint
CREATE TABLE "interview_conversation" (
	"agent_id" text,
	"call_successful" text,
	"conversation_id" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"data_collection_results" jsonb DEFAULT '{}' NOT NULL,
	"dynamic_variables" jsonb DEFAULT '{}' NOT NULL,
	"ended_at" timestamp,
	"evaluation_criteria_results" jsonb DEFAULT '{}' NOT NULL,
	"interview_record_id" text,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"latest_error" text,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"mode" text,
	"recording_duration_secs" integer,
	"recording_egress_id" text,
	"recording_file_key" text,
	"recording_status" text,
	"schedule_entry_id" text,
	"started_at" timestamp,
	"status" text DEFAULT 'initiated' NOT NULL,
	"summary_attempts" integer DEFAULT 0 NOT NULL,
	"summary_error" text,
	"summary_started_at" timestamp,
	"summary_status" text DEFAULT 'pending' NOT NULL,
	"transcript" jsonb DEFAULT '[]' NOT NULL,
	"transcript_summary" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"webhook_received_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "interview_conversation_turn" (
	"conversation_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"id" text PRIMARY KEY,
	"interview_record_id" text,
	"message" text NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"role" text NOT NULL,
	"source" text DEFAULT 'client_event' NOT NULL,
	"time_in_call_secs" integer
);
--> statement-breakpoint
CREATE TABLE "interview_notification" (
	"conversation_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"error" text,
	"feishu_message_id" text,
	"id" text PRIMARY KEY,
	"interview_record_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"recipient_open_id" text NOT NULL,
	"recipient_user_id" text,
	"sent_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"type" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_question_template" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"description" text,
	"id" text PRIMARY KEY,
	"scope" text NOT NULL,
	"title" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_question_template_binding" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"disabled_by_user" boolean DEFAULT false NOT NULL,
	"id" text PRIMARY KEY,
	"interview_record_id" text NOT NULL,
	"sort_order" integer NOT NULL,
	"template_id" text NOT NULL,
	"version_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_question_template_job_description" (
	"job_description_id" text,
	"template_id" text,
	CONSTRAINT "interview_question_template_job_description_pkey" PRIMARY KEY("template_id","job_description_id")
);
--> statement-breakpoint
CREATE TABLE "interview_question_template_question" (
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"difficulty" text DEFAULT 'easy' NOT NULL,
	"id" text PRIMARY KEY,
	"sort_order" integer NOT NULL,
	"template_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_question_template_version" (
	"content_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"snapshot" jsonb NOT NULL,
	"template_id" text NOT NULL,
	"version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interviewer" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"department_id" text NOT NULL,
	"description" text,
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"voice" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_description" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"department_id" text NOT NULL,
	"description" text,
	"feishu_chat_bound_at" timestamp,
	"feishu_chat_bound_by" text,
	"feishu_chat_id" text,
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"preset_questions" jsonb DEFAULT '[]' NOT NULL,
	"prompt" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_description_interviewer" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"interviewer_id" text,
	"job_description_id" text,
	CONSTRAINT "job_description_interviewer_pkey" PRIMARY KEY("job_description_id","interviewer_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"id" text PRIMARY KEY,
	"impersonated_by" text,
	"ip_address" text,
	"token" text NOT NULL UNIQUE,
	"updated_at" timestamp NOT NULL,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_access_token" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"last_used_at" timestamp,
	"name" text DEFAULT 'Resume Parser Skill' NOT NULL,
	"revoked_at" timestamp,
	"scope" text NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_device_auth_code" (
	"approved_token_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"device_code" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"poll_after" timestamp,
	"scope" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"user_code" text NOT NULL,
	"user_id" text
);
--> statement-breakpoint
CREATE TABLE "studio_interview" (
	"candidate_email" text,
	"candidate_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"id" text PRIMARY KEY,
	"interview_questions" jsonb DEFAULT '[]' NOT NULL,
	"job_description_id" text,
	"notes" text,
	"resume_file_name" text,
	"resume_profile" jsonb,
	"resume_storage_key" text,
	"status" text NOT NULL,
	"target_role" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_interview_schedule" (
	"allow_text_input" boolean DEFAULT false NOT NULL,
	"conversation_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"disconnected_at" timestamp,
	"id" text PRIMARY KEY,
	"interview_record_id" text NOT NULL,
	"livekit_participant_identity" text,
	"livekit_room_name" text,
	"notes" text,
	"round_label" text NOT NULL,
	"scheduled_at" timestamp,
	"session_started_at" timestamp,
	"sort_order" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"ban_expires" timestamp,
	"ban_reason" text,
	"banned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"id" text PRIMARY KEY,
	"image" text,
	"name" text NOT NULL,
	"organization_id" text,
	"organization_name" text,
	"role" text DEFAULT 'user' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_uq" ON "account" ("provider_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_form_submission_template_interview_uq" ON "candidate_form_submission" ("template_id","interview_record_id");--> statement-breakpoint
CREATE INDEX "candidate_form_submission_version_idx" ON "candidate_form_submission" ("version_id");--> statement-breakpoint
CREATE INDEX "candidate_form_submission_interview_idx" ON "candidate_form_submission" ("interview_record_id");--> statement-breakpoint
CREATE INDEX "candidate_form_template_scope_idx" ON "candidate_form_template" ("scope");--> statement-breakpoint
CREATE INDEX "candidate_form_template_created_at_idx" ON "candidate_form_template" ("created_at");--> statement-breakpoint
CREATE INDEX "candidate_form_template_jd_jd_idx" ON "candidate_form_template_job_description" ("job_description_id");--> statement-breakpoint
CREATE INDEX "candidate_form_template_question_template_idx" ON "candidate_form_template_question" ("template_id");--> statement-breakpoint
CREATE INDEX "candidate_form_template_question_order_idx" ON "candidate_form_template_question" ("template_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_form_template_version_template_version_uq" ON "candidate_form_template_version" ("template_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_form_template_version_template_hash_uq" ON "candidate_form_template_version" ("template_id","content_hash");--> statement-breakpoint
CREATE INDEX "chat_attachment_user_id_idx" ON "chat_attachment" ("user_id");--> statement-breakpoint
CREATE INDEX "chat_conversation_user_id_idx" ON "chat_conversation" ("user_id");--> statement-breakpoint
CREATE INDEX "chat_conversation_user_updated_idx" ON "chat_conversation" ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "chat_message_conversation_idx" ON "chat_message" ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_state_cache_expires_idx" ON "chat_state_cache" ("expires_at");--> statement-breakpoint
CREATE INDEX "chat_state_lists_expires_idx" ON "chat_state_lists" ("expires_at");--> statement-breakpoint
CREATE INDEX "chat_state_locks_expires_idx" ON "chat_state_locks" ("expires_at");--> statement-breakpoint
CREATE INDEX "chat_state_queues_expires_idx" ON "chat_state_queues" ("expires_at");--> statement-breakpoint
CREATE INDEX "department_name_idx" ON "department" ("name");--> statement-breakpoint
CREATE INDEX "department_created_at_idx" ON "department" ("created_at");--> statement-breakpoint
CREATE INDEX "interview_audit_log_record_idx" ON "interview_audit_log" ("interview_record_id");--> statement-breakpoint
CREATE INDEX "interview_audit_log_created_at_idx" ON "interview_audit_log" ("created_at");--> statement-breakpoint
CREATE INDEX "interview_conversation_record_idx" ON "interview_conversation" ("interview_record_id");--> statement-breakpoint
CREATE INDEX "interview_conversation_status_idx" ON "interview_conversation" ("status");--> statement-breakpoint
CREATE INDEX "interview_conversation_summary_status_idx" ON "interview_conversation" ("summary_status");--> statement-breakpoint
CREATE INDEX "interview_conversation_updated_at_idx" ON "interview_conversation" ("updated_at");--> statement-breakpoint
CREATE INDEX "interview_conversation_turn_conversation_idx" ON "interview_conversation_turn" ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "interview_conversation_turn_record_idx" ON "interview_conversation_turn" ("interview_record_id","created_at");--> statement-breakpoint
CREATE INDEX "interview_notification_record_idx" ON "interview_notification" ("interview_record_id");--> statement-breakpoint
CREATE INDEX "interview_notification_recipient_idx" ON "interview_notification" ("recipient_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_notification_once_uq" ON "interview_notification" ("interview_record_id","conversation_id","type","recipient_user_id","provider_id");--> statement-breakpoint
CREATE INDEX "interview_question_template_scope_idx" ON "interview_question_template" ("scope");--> statement-breakpoint
CREATE INDEX "interview_question_template_created_at_idx" ON "interview_question_template" ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_question_template_binding_interview_template_uq" ON "interview_question_template_binding" ("interview_record_id","template_id");--> statement-breakpoint
CREATE INDEX "interview_question_template_binding_interview_idx" ON "interview_question_template_binding" ("interview_record_id");--> statement-breakpoint
CREATE INDEX "interview_question_template_binding_template_idx" ON "interview_question_template_binding" ("template_id");--> statement-breakpoint
CREATE INDEX "interview_question_template_binding_version_idx" ON "interview_question_template_binding" ("version_id");--> statement-breakpoint
CREATE INDEX "interview_question_template_jd_jd_idx" ON "interview_question_template_job_description" ("job_description_id");--> statement-breakpoint
CREATE INDEX "interview_question_template_question_template_idx" ON "interview_question_template_question" ("template_id");--> statement-breakpoint
CREATE INDEX "interview_question_template_question_order_idx" ON "interview_question_template_question" ("template_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_question_template_version_template_version_uq" ON "interview_question_template_version" ("template_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_question_template_version_template_hash_uq" ON "interview_question_template_version" ("template_id","content_hash");--> statement-breakpoint
CREATE INDEX "interviewer_department_idx" ON "interviewer" ("department_id");--> statement-breakpoint
CREATE INDEX "interviewer_name_idx" ON "interviewer" ("name");--> statement-breakpoint
CREATE INDEX "interviewer_created_at_idx" ON "interviewer" ("created_at");--> statement-breakpoint
CREATE INDEX "job_description_department_idx" ON "job_description" ("department_id");--> statement-breakpoint
CREATE INDEX "job_description_name_idx" ON "job_description" ("name");--> statement-breakpoint
CREATE INDEX "job_description_created_at_idx" ON "job_description" ("created_at");--> statement-breakpoint
CREATE INDEX "job_description_interviewer_interviewer_idx" ON "job_description_interviewer" ("interviewer_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_access_token_hash_uq" ON "skill_access_token" ("token_hash");--> statement-breakpoint
CREATE INDEX "skill_access_token_user_idx" ON "skill_access_token" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_device_auth_code_user_code_uq" ON "skill_device_auth_code" ("user_code");--> statement-breakpoint
CREATE INDEX "skill_device_auth_code_expires_idx" ON "skill_device_auth_code" ("expires_at");--> statement-breakpoint
CREATE INDEX "studio_interview_status_idx" ON "studio_interview" ("status");--> statement-breakpoint
CREATE INDEX "studio_interview_created_at_idx" ON "studio_interview" ("created_at");--> statement-breakpoint
CREATE INDEX "studio_interview_created_by_idx" ON "studio_interview" ("created_by");--> statement-breakpoint
CREATE INDEX "studio_interview_job_description_idx" ON "studio_interview" ("job_description_id");--> statement-breakpoint
CREATE INDEX "studio_interview_schedule_record_idx" ON "studio_interview_schedule" ("interview_record_id");--> statement-breakpoint
CREATE INDEX "studio_interview_schedule_sort_idx" ON "studio_interview_schedule" ("interview_record_id","sort_order");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "candidate_form_submission" ADD CONSTRAINT "candidate_form_submission_OekSV5G6608S_fkey" FOREIGN KEY ("interview_record_id") REFERENCES "studio_interview"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "candidate_form_submission" ADD CONSTRAINT "candidate_form_submission_dULxBVL5akJQ_fkey" FOREIGN KEY ("template_id") REFERENCES "candidate_form_template"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "candidate_form_submission" ADD CONSTRAINT "candidate_form_submission_Po2euoDAYppr_fkey" FOREIGN KEY ("version_id") REFERENCES "candidate_form_template_version"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "candidate_form_template" ADD CONSTRAINT "candidate_form_template_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "candidate_form_template_job_description" ADD CONSTRAINT "candidate_form_template_job_description_3ygJoZQv9FEA_fkey" FOREIGN KEY ("job_description_id") REFERENCES "job_description"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "candidate_form_template_job_description" ADD CONSTRAINT "candidate_form_template_job_description_2BJXfTutcuHl_fkey" FOREIGN KEY ("template_id") REFERENCES "candidate_form_template"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "candidate_form_template_question" ADD CONSTRAINT "candidate_form_template_question_PxiJZNp6QGl3_fkey" FOREIGN KEY ("template_id") REFERENCES "candidate_form_template"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "candidate_form_template_version" ADD CONSTRAINT "candidate_form_template_version_PBy8nrbNPyNR_fkey" FOREIGN KEY ("template_id") REFERENCES "candidate_form_template"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_attachment" ADD CONSTRAINT "chat_attachment_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD CONSTRAINT "chat_conversation_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_conversation_id_chat_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversation"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "department" ADD CONSTRAINT "department_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "feishu_thread_state" ADD CONSTRAINT "feishu_thread_state_active_jd_id_job_description_id_fkey" FOREIGN KEY ("active_jd_id") REFERENCES "job_description"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "global_config" ADD CONSTRAINT "global_config_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "interview_audit_log" ADD CONSTRAINT "interview_audit_log_aoIEHPgEi3Dl_fkey" FOREIGN KEY ("interview_record_id") REFERENCES "studio_interview"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_audit_log" ADD CONSTRAINT "interview_audit_log_operator_id_user_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "interview_audit_log" ADD CONSTRAINT "interview_audit_log_WIrMwSI6gUoW_fkey" FOREIGN KEY ("schedule_entry_id") REFERENCES "studio_interview_schedule"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "interview_conversation" ADD CONSTRAINT "interview_conversation_7E79ZtgKWejQ_fkey" FOREIGN KEY ("interview_record_id") REFERENCES "studio_interview"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "interview_conversation" ADD CONSTRAINT "interview_conversation_MY0dFnw28dGN_fkey" FOREIGN KEY ("schedule_entry_id") REFERENCES "studio_interview_schedule"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "interview_conversation_turn" ADD CONSTRAINT "interview_conversation_turn_jhqV2eUQdApp_fkey" FOREIGN KEY ("conversation_id") REFERENCES "interview_conversation"("conversation_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_conversation_turn" ADD CONSTRAINT "interview_conversation_turn_N6s6mXUvShiW_fkey" FOREIGN KEY ("interview_record_id") REFERENCES "studio_interview"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "interview_notification" ADD CONSTRAINT "interview_notification_DozCZVj7NQrN_fkey" FOREIGN KEY ("conversation_id") REFERENCES "interview_conversation"("conversation_id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "interview_notification" ADD CONSTRAINT "interview_notification_WNyeEFOs0WT8_fkey" FOREIGN KEY ("interview_record_id") REFERENCES "studio_interview"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_notification" ADD CONSTRAINT "interview_notification_recipient_user_id_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "interview_question_template" ADD CONSTRAINT "interview_question_template_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "interview_question_template_binding" ADD CONSTRAINT "interview_question_template_binding_RpZWrKyIawPe_fkey" FOREIGN KEY ("interview_record_id") REFERENCES "studio_interview"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_question_template_binding" ADD CONSTRAINT "interview_question_template_binding_ifUguWBsUpi0_fkey" FOREIGN KEY ("template_id") REFERENCES "interview_question_template"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "interview_question_template_binding" ADD CONSTRAINT "interview_question_template_binding_buToNkgKM1sv_fkey" FOREIGN KEY ("version_id") REFERENCES "interview_question_template_version"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "interview_question_template_job_description" ADD CONSTRAINT "interview_question_template_job_description_bRIPuKzskYde_fkey" FOREIGN KEY ("job_description_id") REFERENCES "job_description"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_question_template_job_description" ADD CONSTRAINT "interview_question_template_job_description_MsY3NOm6rW35_fkey" FOREIGN KEY ("template_id") REFERENCES "interview_question_template"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_question_template_question" ADD CONSTRAINT "interview_question_template_question_B6ZDgzG9TegF_fkey" FOREIGN KEY ("template_id") REFERENCES "interview_question_template"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_question_template_version" ADD CONSTRAINT "interview_question_template_version_dXKNgsLa7t59_fkey" FOREIGN KEY ("template_id") REFERENCES "interview_question_template"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interviewer" ADD CONSTRAINT "interviewer_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "interviewer" ADD CONSTRAINT "interviewer_department_id_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "job_description" ADD CONSTRAINT "job_description_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "job_description" ADD CONSTRAINT "job_description_department_id_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "job_description" ADD CONSTRAINT "job_description_feishu_chat_bound_by_user_id_fkey" FOREIGN KEY ("feishu_chat_bound_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "job_description_interviewer" ADD CONSTRAINT "job_description_interviewer_interviewer_id_interviewer_id_fkey" FOREIGN KEY ("interviewer_id") REFERENCES "interviewer"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "job_description_interviewer" ADD CONSTRAINT "job_description_interviewer_ShsGzu3sHE7L_fkey" FOREIGN KEY ("job_description_id") REFERENCES "job_description"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "skill_access_token" ADD CONSTRAINT "skill_access_token_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "skill_device_auth_code" ADD CONSTRAINT "skill_device_auth_code_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "studio_interview" ADD CONSTRAINT "studio_interview_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "studio_interview" ADD CONSTRAINT "studio_interview_job_description_id_job_description_id_fkey" FOREIGN KEY ("job_description_id") REFERENCES "job_description"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "studio_interview_schedule" ADD CONSTRAINT "studio_interview_schedule_OvJYIg2SsCtN_fkey" FOREIGN KEY ("interview_record_id") REFERENCES "studio_interview"("id") ON DELETE CASCADE;