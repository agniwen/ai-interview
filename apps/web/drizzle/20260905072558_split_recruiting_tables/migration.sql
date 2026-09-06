-- 仅创建招聘新表；不修改旧表、不回填数据、不触发业务任务。
CREATE TABLE "ai_interview_conversation" (
	"agent_id" text,
	"ai_round_id" text,
	"call_successful" text,
	"conversation_id" text PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data_collection_results" jsonb DEFAULT '{}' NOT NULL,
	"dynamic_variables" jsonb DEFAULT '{}' NOT NULL,
	"ended_at" timestamp with time zone,
	"evaluation_criteria_results" jsonb DEFAULT '{}' NOT NULL,
	"key_information" jsonb,
	"key_information_attempts" integer DEFAULT 0 NOT NULL,
	"key_information_error" text,
	"key_information_started_at" timestamp with time zone,
	"key_information_status" text DEFAULT 'pending' NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"latest_error" text,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"metrics" jsonb DEFAULT '{}' NOT NULL,
	"mode" text,
	"organization_id" text NOT NULL,
	"recording_duration_secs" integer,
	"recording_egress_id" text,
	"recording_file_key" text,
	"recording_status" text,
	"recruiting_record_id" text,
	"started_at" timestamp with time zone,
	"status" text DEFAULT 'initiated' NOT NULL,
	"summary_attempts" integer DEFAULT 0 NOT NULL,
	"summary_error" text,
	"summary_started_at" timestamp with time zone,
	"summary_status" text DEFAULT 'pending' NOT NULL,
	"transcript" jsonb DEFAULT '[]' NOT NULL,
	"transcript_summary" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"webhook_received_at" timestamp with time zone
);

--> statement-breakpoint
CREATE TABLE "ai_interview_conversation_turn" (
	"conversation_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"id" text PRIMARY KEY,
	"message" text NOT NULL,
	"organization_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recruiting_record_id" text,
	"role" text NOT NULL,
	"source" text DEFAULT 'client_event' NOT NULL,
	"time_in_call_secs" integer
);

--> statement-breakpoint
CREATE TABLE "ai_interview_round" (
	"allow_text_input" boolean DEFAULT false NOT NULL,
	"candidate_decline_reason" text,
	"candidate_feedback_categories" jsonb,
	"candidate_feedback_detail" text,
	"candidate_feedback_submitted_at" timestamp with time zone,
	"candidate_invite_expires_at" timestamp with time zone,
	"candidate_invite_status" text DEFAULT 'pending' NOT NULL,
	"candidate_invite_token_hash" text,
	"candidate_responded_at" timestamp with time zone,
	"conversation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"disconnected_at" timestamp with time zone,
	"id" text PRIMARY KEY,
	"invitation_version" integer DEFAULT 1 NOT NULL,
	"livekit_participant_identity" text,
	"livekit_room_name" text,
	"notes" text,
	"organization_id" text NOT NULL,
	"recruiting_record_id" text NOT NULL,
	"review_notes" text,
	"review_outcome" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"round_label" text NOT NULL,
	"scheduled_at" timestamp with time zone,
	"scheduled_end_at" timestamp with time zone,
	"session_started_at" timestamp with time zone,
	"sort_order" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_round_status_check" CHECK ("status" IN ('pending','in_progress','interrupted','completed')),
	CONSTRAINT "ai_round_review_check" CHECK ("review_outcome" IS NULL OR "review_outcome" IN ('pass', 'fail')),
	CONSTRAINT "ai_interview_round_invite_status_check" CHECK ("candidate_invite_status" IN ('pending', 'sent', 'accepted', 'declined', 'expired')),
	CONSTRAINT "ai_interview_round_invitation_version_check" CHECK ("invitation_version" > 0)
);

--> statement-breakpoint
CREATE TABLE "candidate" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"email" text,
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"organization_id" text NOT NULL,
	"phone" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "candidate_resume" (
	"candidate_id" text NOT NULL,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"file_name" text,
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"parse_error" text,
	"parse_status" text DEFAULT 'unparsed' NOT NULL,
	"parsed_at" timestamp with time zone,
	"profile" jsonb,
	"search_cjk_bigrams" text[],
	"search_text" text,
	"skills_normalized" text[] DEFAULT '{}'::text[] NOT NULL,
	"storage_key" text,
	"text" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer NOT NULL,
	CONSTRAINT "candidate_resume_version_check" CHECK ("version" > 0),
	CONSTRAINT "candidate_resume_parse_status_check" CHECK ("parse_status" IN ('unparsed', 'queued', 'processing', 'ready', 'failed'))
);

--> statement-breakpoint
CREATE TABLE "human_interview_evaluation_document_sync" (
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"block_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"document_id" text,
	"document_url" text,
	"error" text,
	"lease_owner" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"organization_id" text NOT NULL,
	"provider_id" text,
	"round_id" text NOT NULL UNIQUE,
	"snapshot_id" text PRIMARY KEY,
	"status" text DEFAULT 'pending' NOT NULL,
	"synced_at" timestamp with time zone,
	CONSTRAINT "human_interview_evaluation_document_sync_status_check" CHECK ("status" in ('pending', 'syncing', 'waiting_document', 'failed', 'synced'))
);

--> statement-breakpoint
CREATE TABLE "human_interview_evaluation_snapshot" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"evaluation" jsonb NOT NULL,
	"id" text PRIMARY KEY,
	"meeting_session_id" text,
	"organization_id" text NOT NULL,
	"outcome" text,
	"round_id" text NOT NULL,
	"source" text NOT NULL,
	"transcript_revision_id" text,
	CONSTRAINT "human_interview_evaluation_snapshot_source_check" CHECK ("source" in ('ai_generated', 'human_submitted'))
);

--> statement-breakpoint
CREATE TABLE "human_interview_meeting" (
	"cancelled_at" timestamp with time zone,
	"candidate_recording_duration_ms" integer,
	"candidate_recording_egress_id" text,
	"candidate_recording_error" text,
	"candidate_recording_file_key" text,
	"candidate_recording_size_bytes" integer,
	"candidate_recording_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"ended_at" timestamp with time zone,
	"feishu_app_link" text,
	"feishu_attendee_open_ids" jsonb,
	"feishu_calendar_event_id" text,
	"feishu_calendar_event_url" text,
	"feishu_calendar_id" text,
	"feishu_last_error" text,
	"feishu_meeting_id" text,
	"feishu_meeting_no" text,
	"feishu_meeting_url" text,
	"feishu_owner_open_id" text,
	"feishu_provider_id" text,
	"feishu_reserve_id" text,
	"feishu_sync_status" text,
	"feishu_synced_at" timestamp with time zone,
	"id" text PRIMARY KEY,
	"lifecycle_occurred_at" timestamp with time zone,
	"lifecycle_source" text,
	"livekit_room_name" text,
	"notes" text,
	"organization_id" text NOT NULL,
	"processing_meeting_session_id" text UNIQUE,
	"recording_duration_ms" integer,
	"recording_egress_id" text,
	"recording_error" text,
	"recording_file_key" text,
	"recording_size_bytes" integer,
	"recording_status" text DEFAULT 'pending' NOT NULL,
	"recording_tracks" jsonb,
	"schedule_version" integer DEFAULT 1 NOT NULL,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"title" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	CONSTRAINT "human_interview_meeting_schedule_version_check" CHECK ("schedule_version" > 0),
	CONSTRAINT "human_interview_meeting_recording_status_check" CHECK ("recording_status" in ('pending', 'starting', 'active', 'completed', 'failed')),
	CONSTRAINT "human_interview_meeting_candidate_recording_status_check" CHECK ("candidate_recording_status" in ('pending', 'starting', 'active', 'completed', 'failed'))
);

--> statement-breakpoint
CREATE TABLE "human_interview_meeting_event" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"meeting_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"type" text NOT NULL
);

--> statement-breakpoint
CREATE TABLE "human_interview_meeting_interviewer" (
	"feishu_open_id" text,
	"joined_at" timestamp with time zone,
	"left_at" timestamp with time zone,
	"live_transcript_draft" jsonb,
	"live_transcript_draft_version" integer DEFAULT 0 NOT NULL,
	"meeting_id" text,
	"organization_id" text NOT NULL,
	"role" text DEFAULT 'interviewer' NOT NULL,
	"user_id" text,
	CONSTRAINT "human_interview_meeting_interviewer_pkey" PRIMARY KEY("meeting_id","user_id"),
	CONSTRAINT "human_interview_meeting_interviewer_draft_version_check" CHECK ("live_transcript_draft_version" >= 0)
);

--> statement-breakpoint
CREATE TABLE "human_interview_meeting_round" (
	"candidate_decline_reason" text,
	"candidate_invite_expires_at" timestamp with time zone,
	"candidate_invite_status" text DEFAULT 'pending' NOT NULL,
	"candidate_invite_token_hash" text,
	"candidate_responded_at" timestamp with time zone,
	"invitation_version" integer DEFAULT 1 NOT NULL,
	"joined_at" timestamp with time zone,
	"left_at" timestamp with time zone,
	"meeting_id" text,
	"organization_id" text NOT NULL,
	"round_id" text,
	CONSTRAINT "human_interview_meeting_round_pkey" PRIMARY KEY("meeting_id","round_id"),
	CONSTRAINT "human_interview_meeting_round_invite_status_check" CHECK ("candidate_invite_status" IN ('pending', 'sent', 'accepted', 'declined', 'expired')),
	CONSTRAINT "human_interview_meeting_round_invitation_version_check" CHECK ("invitation_version" > 0)
);

--> statement-breakpoint
CREATE TABLE "human_interview_round" (
	"cancel_reason" text,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evaluation" jsonb,
	"evaluation_error" text,
	"evaluation_status" text DEFAULT 'not_started' NOT NULL,
	"evaluation_submitted_at" timestamp with time zone,
	"evaluation_transcript_revision_id" text,
	"evaluation_updated_at" timestamp with time zone,
	"evaluation_updated_by" text,
	"feedback" text,
	"format" text NOT NULL,
	"id" text PRIMARY KEY,
	"label" text NOT NULL,
	"location" text,
	"meeting_url" text,
	"notes" text,
	"organization_id" text NOT NULL,
	"outcome" text,
	"recruiting_record_id" text NOT NULL,
	"round_kind" text NOT NULL,
	"scheduled_at" timestamp with time zone,
	"score" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "human_round_status_check" CHECK ("status" IN ('pending','completed','cancelled')),
	CONSTRAINT "human_round_outcome_check" CHECK ("outcome" IS NULL OR "outcome" IN ('pass','fail','inconclusive')),
	CONSTRAINT "human_round_kind_check" CHECK ("round_kind" IN ('second_interview', 'final_interview')),
	CONSTRAINT "human_interview_round_evaluation_status_check" CHECK ("evaluation_status" in ('not_started', 'generating', 'draft', 'submitted', 'failed'))
);

--> statement-breakpoint
CREATE TABLE "human_interview_round_interviewer" (
	"confirmed_at" timestamp with time zone,
	"confirmed_schedule_version" integer,
	"decline_reason" text,
	"declined_at" timestamp with time zone,
	"organization_id" text NOT NULL,
	"round_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"user_id" text,
	CONSTRAINT "human_interview_round_interviewer_pkey" PRIMARY KEY("round_id","user_id"),
	CONSTRAINT "human_interview_round_interviewer_status_check" CHECK ("status" IN ('pending', 'confirmed', 'declined')),
	CONSTRAINT "human_interview_round_interviewer_confirmed_version_check" CHECK ("confirmed_schedule_version" IS NULL OR "confirmed_schedule_version" > 0)
);

--> statement-breakpoint
CREATE TABLE "recruiting_context_snapshot" (
	"ai_round_id" text,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"reason" text NOT NULL,
	"recruiting_record_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"superseded_at" timestamp with time zone,
	"version" integer NOT NULL
);

--> statement-breakpoint
CREATE TABLE "recruiting_duplicate_match" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"embedding_version" text NOT NULL,
	"id" text PRIMARY KEY,
	"level" text NOT NULL,
	"matched_source_id" text NOT NULL,
	"matched_source_type" text NOT NULL,
	"organization_id" text NOT NULL,
	"reasons" jsonb DEFAULT '[]' NOT NULL,
	"score" integer NOT NULL,
	"signals" jsonb DEFAULT '[]' NOT NULL,
	"similarity" jsonb,
	"source_id" text NOT NULL,
	"source_type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruiting_duplicate_source_check" CHECK ("source_type" IN ('resume_pool_item','recruiting_record','job_description') AND "matched_source_type" IN ('resume_pool_item','recruiting_record','job_description'))
);

--> statement-breakpoint
CREATE TABLE "recruiting_event" (
	"action" text NOT NULL,
	"ai_round_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"detail" jsonb DEFAULT '{}' NOT NULL,
	"from_outcome" text,
	"from_stage" text,
	"id" text PRIMARY KEY,
	"operator_id" text,
	"organization_id" text NOT NULL,
	"pipeline_version" integer,
	"reason_code" text,
	"recruiting_record_id" text NOT NULL,
	"to_outcome" text,
	"to_stage" text,
	CONSTRAINT "recruiting_event_stage_pair_check" CHECK (("from_stage" IS NULL) = ("to_stage" IS NULL)),
	CONSTRAINT "recruiting_event_outcome_pair_check" CHECK (("from_outcome" IS NULL) = ("to_outcome" IS NULL)),
	CONSTRAINT "recruiting_event_version_check" CHECK ("pipeline_version" IS NULL OR "pipeline_version" >= 0)
);

--> statement-breakpoint
CREATE TABLE "recruiting_evidence_snapshot" (
	"ai_round_id" text,
	"content_hash" text NOT NULL,
	"context_snapshot_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"recruiting_record_id" text NOT NULL
);

--> statement-breakpoint
CREATE TABLE "recruiting_form_submission" (
	"answers" jsonb DEFAULT '{}' NOT NULL,
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"recruiting_record_id" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"template_id" text NOT NULL,
	"version_id" text NOT NULL
);

--> statement-breakpoint
CREATE TABLE "recruiting_fulfillment" (
	"actual_joining_date" date,
	"background_check_completed_at" timestamp with time zone,
	"background_check_notes" text,
	"background_check_started_at" timestamp with time zone,
	"candidate_expectations" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expected_joining_date" date,
	"income_proof_notes" text,
	"negotiation_notes" text,
	"onboarding_confirmed_at" timestamp with time zone,
	"onboarding_confirmed_by" text,
	"onboarding_contact" text,
	"organization_id" text NOT NULL,
	"recruiting_record_id" text PRIMARY KEY,
	"selected_offer_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "recruiting_interview_preparation" (
	"organization_id" text NOT NULL,
	"questions" jsonb DEFAULT '[]' NOT NULL,
	"recruiting_record_id" text PRIMARY KEY,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "recruiting_job_match_candidate" (
	"ai_rank" integer,
	"ai_reason" text,
	"ai_score" integer,
	"id" text PRIMARY KEY,
	"job_description_id" text,
	"job_snapshot" jsonb NOT NULL,
	"organization_id" text NOT NULL,
	"overview_score" double precision,
	"recall_rank" integer,
	"recall_source" text NOT NULL,
	"run_id" text NOT NULL,
	"skill_role_score" double precision,
	"vector_score" integer,
	"work_project_score" double precision,
	CONSTRAINT "recruiting_job_match_candidate_ai_score_check" CHECK ("ai_score" IS NULL OR ("ai_score" >= 0 AND "ai_score" <= 100)),
	CONSTRAINT "recruiting_job_match_candidate_ai_rank_check" CHECK ("ai_rank" IS NULL OR "ai_rank" > 0),
	CONSTRAINT "recruiting_job_match_candidate_recall_rank_check" CHECK ("recall_rank" IS NULL OR "recall_rank" > 0)
);

--> statement-breakpoint
CREATE TABLE "recruiting_job_match_run" (
	"batch_item_id" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_message" text,
	"id" text PRIMARY KEY,
	"mail_message_id" text,
	"matcher_version" text NOT NULL,
	"model" text,
	"organization_id" text NOT NULL,
	"pool_item_id" text NOT NULL,
	"prompt_version" text,
	"resume_input_hash" text NOT NULL,
	"selected_job_description_id" text,
	"selection_method" text,
	"status" text NOT NULL
);

--> statement-breakpoint
CREATE TABLE "recruiting_mail_message" (
	"account_id" text NOT NULL,
	"attachment_count" integer,
	"batch_id" text,
	"bound_job_description_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_message" text,
	"extracted_job_codes" jsonb,
	"from_address" text,
	"id" text PRIMARY KEY,
	"jd_bind_status" text,
	"mailbox" text NOT NULL,
	"message_id" text,
	"organization_id" text NOT NULL,
	"processed_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"resume_attachment_count" integer,
	"skip_reason" text,
	"status" text NOT NULL,
	"subject" text,
	"uid" text NOT NULL,
	"uid_validity" text NOT NULL
);

--> statement-breakpoint
CREATE TABLE "recruiting_material" (
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"file_name" text NOT NULL,
	"id" text PRIMARY KEY,
	"kind" text NOT NULL,
	"organization_id" text NOT NULL,
	"recruiting_record_id" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by" text,
	CONSTRAINT "recruiting_material_kind_check" CHECK ("kind" IN ('income_proof', 'background_report', 'offer_document')),
	CONSTRAINT "recruiting_material_size_check" CHECK ("size_bytes" >= 0 AND "size_bytes" <= 9007199254740991)
);

--> statement-breakpoint
CREATE TABLE "recruiting_meeting_context" (
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"linked_by" text,
	"meeting_id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"recruiting_record_id" text NOT NULL
);

--> statement-breakpoint
CREATE TABLE "recruiting_migration_map" (
	"copied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_hash" text NOT NULL,
	"source_key" text,
	"source_table" text,
	"target_key" text NOT NULL,
	"target_table" text,
	CONSTRAINT "recruiting_migration_map_pkey" PRIMARY KEY("source_table","source_key","target_table")
);

--> statement-breakpoint
CREATE TABLE "recruiting_node_state" (
	"completed_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"effective_ai_round_id" text,
	"effective_human_round_id" text,
	"effective_offer_id" text,
	"entered_at" timestamp with time zone,
	"node" text,
	"organization_id" text NOT NULL,
	"reason" text,
	"recruiting_record_id" text,
	"result" text,
	"status" text DEFAULT 'inactive' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruiting_node_state_pkey" PRIMARY KEY("recruiting_record_id","node"),
	CONSTRAINT "recruiting_node_kind_check" CHECK ("node" IN ('screening', 'ai_interview', 'second_interview', 'final_interview', 'income_proof', 'offer', 'background_check', 'onboarding')),
	CONSTRAINT "recruiting_node_status_check" CHECK ("status" IN ('inactive', 'pending', 'scheduled', 'in_progress', 'awaiting_review', 'negotiating', 'awaiting_send', 'awaiting_response', 'completed', 'skipped')),
	CONSTRAINT "recruiting_node_result_check" CHECK ("result" IS NULL OR "result" IN ('pass', 'fail', 'withdrawn')),
	CONSTRAINT "recruiting_node_result_status_check" CHECK (("status" = 'completed' AND "result" IS NOT NULL) OR ("status" <> 'completed' AND "result" IS NULL)),
	CONSTRAINT "recruiting_node_progress_check" CHECK (("status" IN ('inactive', 'pending', 'completed', 'skipped')) OR ("node" IN ('ai_interview', 'second_interview', 'final_interview') AND "status" IN ('scheduled', 'in_progress', 'awaiting_review')) OR ("node" IN ('income_proof', 'background_check') AND "status" IN ('in_progress', 'awaiting_review')) OR ("node" = 'offer' AND "status" IN ('negotiating', 'awaiting_send', 'awaiting_response'))),
	CONSTRAINT "recruiting_node_evidence_check" CHECK (("effective_ai_round_id" IS NULL OR "node" = 'ai_interview') AND ("effective_human_round_id" IS NULL OR "node" IN ('second_interview', 'final_interview')) AND ("effective_offer_id" IS NULL OR "node" = 'offer')),
	CONSTRAINT "recruiting_node_inactive_check" CHECK ("status" NOT IN ('inactive', 'skipped') OR ("effective_ai_round_id" IS NULL AND "effective_human_round_id" IS NULL AND "effective_offer_id" IS NULL))
);

--> statement-breakpoint
CREATE TABLE "recruiting_notification_delivery" (
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"audience_type" text,
	"channel" text,
	"conversation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	"event_id" text,
	"feishu_document_id" text,
	"feishu_document_url" text,
	"feishu_message_id" text,
	"id" text PRIMARY KEY,
	"last_error_code" text,
	"lease_expires_at" timestamp with time zone,
	"lease_owner" text,
	"next_attempt_at" timestamp with time zone,
	"organization_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"provider_message_id" text,
	"provider_request_key" text,
	"recipient_address" text,
	"recipient_display_name" text,
	"recipient_open_id" text NOT NULL,
	"recipient_user_id" text,
	"recruiting_record_id" text NOT NULL,
	"rendered_content" text,
	"rendered_subject" text,
	"result_unknown_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"template_version_id" text,
	"type" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruiting_notification_delivery_delivery_status_check" CHECK ("status" IN ('pending', 'sending', 'sent', 'failed', 'dead', 'unknown', 'cancelled')),
	CONSTRAINT "recruiting_notification_delivery_attempt_count_check" CHECK ("attempt_count" >= 0),
	CONSTRAINT "recruiting_notification_delivery_lease_pair_check" CHECK (("lease_owner" IS NULL) = ("lease_expires_at" IS NULL))
);

--> statement-breakpoint
CREATE TABLE "recruiting_notification_event" (
	"actor_user_id" text,
	"ai_round_id" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"conversation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dedupe_key" text NOT NULL,
	"human_meeting_id" text,
	"human_round_id" text,
	"id" text PRIMARY KEY,
	"last_error_code" text,
	"last_error_message" text,
	"lease_expires_at" timestamp with time zone,
	"lease_owner" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"organization_id" text NOT NULL,
	"payload_snapshot" jsonb NOT NULL,
	"recruiting_record_id" text,
	"scope_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"type" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruiting_notification_event_status_check" CHECK ("status" IN ('pending', 'processing', 'completed', 'failed', 'dead', 'cancelled')),
	CONSTRAINT "recruiting_notification_event_scope_check" CHECK ((
        ("scope_type" = 'interview_record' AND "recruiting_record_id" IS NOT NULL)
        OR ("scope_type" = 'ai_round' AND "ai_round_id" IS NOT NULL)
        OR ("scope_type" = 'human_meeting' AND "human_meeting_id" IS NOT NULL)
      )),
	CONSTRAINT "recruiting_notification_event_attempt_count_check" CHECK ("attempt_count" >= 0),
	CONSTRAINT "recruiting_notification_event_lease_pair_check" CHECK (("lease_owner" IS NULL) = ("lease_expires_at" IS NULL))
);

--> statement-breakpoint
CREATE TABLE "recruiting_notification_recipient" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"organization_id" text NOT NULL,
	"recruiting_record_id" text,
	"user_id" text,
	CONSTRAINT "recruiting_notification_recipient_pkey" PRIMARY KEY("recruiting_record_id","user_id")
);

--> statement-breakpoint
CREATE TABLE "recruiting_offer" (
	"base_salary" integer NOT NULL,
	"bonus" integer,
	"candidate_counter" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency" text DEFAULT 'CNY' NOT NULL,
	"equity" text,
	"expires_at" timestamp with time zone,
	"id" text PRIMARY KEY,
	"joining_date" timestamp with time zone,
	"notes" text,
	"organization_id" text NOT NULL,
	"position" text NOT NULL,
	"recruiting_record_id" text NOT NULL,
	"response_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer NOT NULL,
	CONSTRAINT "recruiting_offer_status_check" CHECK ("status" IN ('draft','sent','accepted','declined','expired','superseded')),
	CONSTRAINT "recruiting_offer_salary_check" CHECK ("base_salary" >= 0 AND ("bonus" IS NULL OR "bonus" >= 0)),
	CONSTRAINT "recruiting_offer_version_check" CHECK ("version" > 0)
);

--> statement-breakpoint
CREATE TABLE "recruiting_pool_import" (
	"id" text PRIMARY KEY,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_by" text,
	"organization_id" text NOT NULL,
	"pool_item_id" text NOT NULL,
	"recruiting_record_id" text NOT NULL
);

--> statement-breakpoint
CREATE TABLE "recruiting_question_template_binding" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_by_user" boolean DEFAULT false NOT NULL,
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"recruiting_record_id" text NOT NULL,
	"sort_order" integer NOT NULL,
	"template_id" text NOT NULL,
	"version_id" text NOT NULL
);

--> statement-breakpoint
CREATE TABLE "recruiting_record" (
	"active_evaluation_id" text,
	"candidate_id" text NOT NULL,
	"close_details" jsonb,
	"close_reason" text,
	"closed_at" timestamp with time zone,
	"closed_from_node" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"current_evaluation_id" text,
	"current_stage" text DEFAULT 'screening' NOT NULL,
	"hr_resume_assessment" text,
	"hr_resume_assessment_updated_at" timestamp with time zone,
	"hr_resume_assessment_updated_by" text,
	"id" text PRIMARY KEY,
	"job_description_id" text,
	"notes" text,
	"organization_id" text NOT NULL,
	"outcome" text DEFAULT 'in_pipeline' NOT NULL,
	"owner_id" text,
	"resume_id" text,
	"source_imported_at" timestamp with time zone,
	"source_imported_by" text,
	"source_pool_item_id" text,
	"source_type" text,
	"stage_entered_at" timestamp with time zone,
	"target_role" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "recruiting_record_stage_check" CHECK ("current_stage" IN ('screening', 'ai_interview', 'second_interview', 'final_interview', 'income_proof', 'offer', 'background_check', 'onboarding', 'closed')),
	CONSTRAINT "recruiting_record_outcome_check" CHECK ("outcome" IN ('in_pipeline', 'hired', 'rejected', 'withdrawn', 'archived')),
	CONSTRAINT "recruiting_record_end_check" CHECK (("current_stage" = 'closed' AND "outcome" <> 'in_pipeline' AND "closed_at" IS NOT NULL) OR ("current_stage" <> 'closed' AND "outcome" = 'in_pipeline' AND "closed_at" IS NULL AND "closed_from_node" IS NULL AND "close_reason" IS NULL AND "close_details" IS NULL)),
	CONSTRAINT "recruiting_record_closed_node_check" CHECK ("closed_from_node" IS NULL OR "closed_from_node" IN ('screening', 'ai_interview', 'second_interview', 'final_interview', 'income_proof', 'offer', 'background_check', 'onboarding')),
	CONSTRAINT "recruiting_record_reason_check" CHECK ("close_reason" IS NULL OR "close_reason" IN ('resume_rejected', 'interview_failed', 'salary_disagreement', 'offer_declined', 'background_check_failed', 'candidate_withdrew', 'onboarding_no_show', 'position_closed', 'onboarded', 'other')),
	CONSTRAINT "recruiting_record_version_check" CHECK ("version" >= 0)
);

--> statement-breakpoint
CREATE TABLE "recruiting_resume_evaluation" (
	"artifact" jsonb,
	"completed_at" timestamp with time zone,
	"contract_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_message" text,
	"id" text PRIMARY KEY,
	"input_hash" text,
	"job_description_version_id" text,
	"kind" text DEFAULT 'resume_review' NOT NULL,
	"numeric_score" integer,
	"organization_id" text NOT NULL,
	"recommendation_level" text,
	"recruiting_record_id" text NOT NULL,
	"resume_id" text,
	"run_id" text,
	"started_at" timestamp with time zone,
	"status" text NOT NULL,
	CONSTRAINT "recruiting_evaluation_kind_check" CHECK ("kind" IN ('resume_review', 'resume_screening')),
	CONSTRAINT "recruiting_evaluation_status_check" CHECK ("status" IN ('queued', 'processing', 'succeeded', 'failed')),
	CONSTRAINT "recruiting_evaluation_artifact_check" CHECK ("status" <> 'succeeded' OR "artifact" IS NOT NULL),
	CONSTRAINT "recruiting_evaluation_error_check" CHECK ("status" <> 'failed' OR "error_message" IS NOT NULL),
	CONSTRAINT "recruiting_evaluation_score_check" CHECK ("numeric_score" IS NULL OR "numeric_score" BETWEEN 0 AND 100),
	CONSTRAINT "recruiting_evaluation_level_check" CHECK ("recommendation_level" IS NULL OR "recommendation_level" IN ('not_recommended', 'undecided', 'recommended', 'highly_recommended'))
);

--> statement-breakpoint
CREATE TABLE "recruiting_round_email_log" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_message" text,
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"recruiting_record_id" text NOT NULL,
	"resend_message_id" text,
	"round_id" text NOT NULL,
	"sent_by" text,
	"status" text NOT NULL,
	"subject" text NOT NULL,
	"template_key" text DEFAULT 'round_invite' NOT NULL,
	"to_email" text NOT NULL
);

--> statement-breakpoint
CREATE TABLE "recruiting_search_index" (
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"embedding_model" text NOT NULL,
	"embedding_version" text NOT NULL,
	"error_message" text,
	"id" text PRIMARY KEY,
	"last_indexed_at" timestamp with time zone,
	"organization_id" text NOT NULL,
	"profile_hash" text NOT NULL,
	"source_id" text NOT NULL,
	"source_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruiting_search_source_check" CHECK ("source_type" IN ('resume_pool_item','recruiting_record','job_description'))
);

--> statement-breakpoint
CREATE TABLE "recruiting_upload_batch" (
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"dedup_policy" text NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"id" text PRIMARY KEY,
	"jd_mode" text NOT NULL,
	"job_description_id" text,
	"job_match_requested_at" timestamp with time zone,
	"organization_id" text NOT NULL,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"resume_pool_scope" text,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"succeeded_count" integer DEFAULT 0 NOT NULL,
	"target" text DEFAULT 'resume_library' NOT NULL,
	"total_count" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "recruiting_upload_batch_item" (
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"batch_id" text NOT NULL,
	"content_hash" text,
	"dedup_match_snapshot" jsonb,
	"error_message" text,
	"file_size" integer NOT NULL,
	"finished_at" timestamp with time zone,
	"id" text PRIMARY KEY,
	"order_index" integer NOT NULL,
	"organization_id" text NOT NULL,
	"original_file_name" text NOT NULL,
	"pool_item_id" text,
	"queue_job_id" text,
	"queued_at" timestamp with time zone,
	"recruiting_record_id" text,
	"started_at" timestamp with time zone,
	"status" text NOT NULL,
	"storage_key" text NOT NULL
);

--> statement-breakpoint
CREATE UNIQUE INDEX "ai_conversation_round_org_uq" ON "ai_interview_conversation" ("conversation_id","ai_round_id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_interview_conversation_conversation_id_org_uq" ON "ai_interview_conversation" ("conversation_id","organization_id");
--> statement-breakpoint
CREATE INDEX "ai_interview_conversation_record_idx" ON "ai_interview_conversation" ("recruiting_record_id");
--> statement-breakpoint
CREATE INDEX "ai_interview_conversation_key_information_status_idx" ON "ai_interview_conversation" ("key_information_status");
--> statement-breakpoint
CREATE INDEX "ai_interview_conversation_ai_round_idx" ON "ai_interview_conversation" ("ai_round_id");
--> statement-breakpoint
CREATE INDEX "ai_interview_conversation_status_idx" ON "ai_interview_conversation" ("status");
--> statement-breakpoint
CREATE INDEX "ai_interview_conversation_summary_status_idx" ON "ai_interview_conversation" ("summary_status");
--> statement-breakpoint
CREATE INDEX "ai_interview_conversation_updated_at_idx" ON "ai_interview_conversation" ("updated_at");
--> statement-breakpoint
CREATE INDEX "ai_interview_conversation_org_ended_started_idx" ON "ai_interview_conversation" ("organization_id","ended_at","started_at");
--> statement-breakpoint
CREATE INDEX "ai_interview_conversation_turn_conversation_idx" ON "ai_interview_conversation_turn" ("conversation_id","created_at");
--> statement-breakpoint
CREATE INDEX "ai_interview_conversation_turn_record_idx" ON "ai_interview_conversation_turn" ("recruiting_record_id","created_at");
--> statement-breakpoint
CREATE INDEX "ai_interview_conversation_turn_organization_idx" ON "ai_interview_conversation_turn" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_interview_round_id_org_uq" ON "ai_interview_round" ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_interview_round_id_record_org_uq" ON "ai_interview_round" ("id","recruiting_record_id","organization_id");
--> statement-breakpoint
CREATE INDEX "ai_interview_round_sort_idx" ON "ai_interview_round" ("recruiting_record_id","sort_order");
--> statement-breakpoint
CREATE INDEX "ai_interview_round_created_by_idx" ON "ai_interview_round" ("created_by");
--> statement-breakpoint
CREATE INDEX "ai_interview_round_org_created_at_idx" ON "ai_interview_round" ("organization_id","created_at");
--> statement-breakpoint
CREATE INDEX "ai_interview_round_org_created_by_created_at_idx" ON "ai_interview_round" ("organization_id","created_by","created_at");
--> statement-breakpoint
CREATE INDEX "ai_interview_round_org_status_created_at_idx" ON "ai_interview_round" ("organization_id","status","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_interview_round_invite_token_uq" ON "ai_interview_round" ("candidate_invite_token_hash") WHERE "candidate_invite_token_hash" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_id_org_uq" ON "candidate" ("id","organization_id");
--> statement-breakpoint
CREATE INDEX "candidate_org_created_idx" ON "candidate" ("organization_id","created_at");
--> statement-breakpoint
CREATE INDEX "candidate_org_email_idx" ON "candidate" ("organization_id","email");
--> statement-breakpoint
CREATE INDEX "candidate_org_phone_idx" ON "candidate" ("organization_id","phone");
--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_resume_id_org_uq" ON "candidate_resume" ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_resume_id_candidate_org_uq" ON "candidate_resume" ("id","candidate_id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_resume_candidate_version_uq" ON "candidate_resume" ("candidate_id","version");
--> statement-breakpoint
CREATE INDEX "candidate_resume_org_hash_idx" ON "candidate_resume" ("organization_id","content_hash");
--> statement-breakpoint
CREATE INDEX "candidate_resume_search_text_idx" ON "candidate_resume" USING gin ("search_text" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "candidate_resume_bigrams_idx" ON "candidate_resume" USING gin ("search_cjk_bigrams");
--> statement-breakpoint
CREATE INDEX "candidate_resume_skills_idx" ON "candidate_resume" USING gin ("skills_normalized");
--> statement-breakpoint
CREATE INDEX "human_interview_evaluation_document_sync_due_idx" ON "human_interview_evaluation_document_sync" ("status","next_attempt_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "human_interview_evaluation_snapshot_id_org_uq" ON "human_interview_evaluation_snapshot" ("id","organization_id");
--> statement-breakpoint
CREATE INDEX "human_interview_evaluation_snapshot_round_created_idx" ON "human_interview_evaluation_snapshot" ("round_id","created_at");
--> statement-breakpoint
CREATE INDEX "human_interview_evaluation_snapshot_org_created_idx" ON "human_interview_evaluation_snapshot" ("organization_id","created_at");
--> statement-breakpoint
CREATE INDEX "human_interview_meeting_schedule_idx" ON "human_interview_meeting" ("organization_id","scheduled_at");
--> statement-breakpoint
CREATE INDEX "human_interview_meeting_status_idx" ON "human_interview_meeting" ("organization_id","status");
--> statement-breakpoint
CREATE INDEX "human_interview_meeting_recording_status_idx" ON "human_interview_meeting" ("organization_id","recording_status");
--> statement-breakpoint
CREATE UNIQUE INDEX "human_interview_meeting_id_org_uq" ON "human_interview_meeting" ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "human_interview_meeting_livekit_room_idx" ON "human_interview_meeting" ("livekit_room_name");
--> statement-breakpoint
CREATE INDEX "human_interview_meeting_feishu_meeting_idx" ON "human_interview_meeting" ("feishu_provider_id","feishu_meeting_id");
--> statement-breakpoint
CREATE INDEX "human_interview_meeting_event_meeting_idx" ON "human_interview_meeting_event" ("meeting_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "human_interview_meeting_event_provider_event_idx" ON "human_interview_meeting_event" ("provider","provider_event_id");
--> statement-breakpoint
CREATE INDEX "human_interview_meeting_interviewer_user_idx" ON "human_interview_meeting_interviewer" ("user_id");
--> statement-breakpoint
CREATE INDEX "human_interview_meeting_round_round_idx" ON "human_interview_meeting_round" ("round_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "human_interview_meeting_round_invite_token_idx" ON "human_interview_meeting_round" ("candidate_invite_token_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "human_interview_round_id_org_uq" ON "human_interview_round" ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "human_interview_round_id_record_org_uq" ON "human_interview_round" ("id","recruiting_record_id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "human_round_id_record_org_kind_uq" ON "human_interview_round" ("id","recruiting_record_id","organization_id","round_kind");
--> statement-breakpoint
CREATE INDEX "human_round_org_kind_result_idx" ON "human_interview_round" ("organization_id","round_kind","outcome");
--> statement-breakpoint
CREATE INDEX "human_interview_round_sort_idx" ON "human_interview_round" ("recruiting_record_id","sort_order");
--> statement-breakpoint
CREATE INDEX "human_interview_round_status_idx" ON "human_interview_round" ("status");
--> statement-breakpoint
CREATE INDEX "human_interview_round_evaluation_status_idx" ON "human_interview_round" ("evaluation_status");
--> statement-breakpoint
CREATE INDEX "human_interview_round_interviewer_user_idx" ON "human_interview_round_interviewer" ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_context_snapshot_owner_uq" ON "recruiting_context_snapshot" ("id","recruiting_record_id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_context_snapshot_record_version_uq" ON "recruiting_context_snapshot" ("recruiting_record_id","version");
--> statement-breakpoint
CREATE INDEX "recruiting_context_snapshot_record_status_idx" ON "recruiting_context_snapshot" ("recruiting_record_id","status");
--> statement-breakpoint
CREATE INDEX "recruiting_context_snapshot_round_idx" ON "recruiting_context_snapshot" ("ai_round_id");
--> statement-breakpoint
CREATE INDEX "recruiting_context_snapshot_organization_idx" ON "recruiting_context_snapshot" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_duplicate_match_source_target_version_uq" ON "recruiting_duplicate_match" ("organization_id","source_type","source_id","matched_source_type","matched_source_id","embedding_version");
--> statement-breakpoint
CREATE INDEX "recruiting_duplicate_match_org_source_idx" ON "recruiting_duplicate_match" ("organization_id","source_type","source_id","created_at");
--> statement-breakpoint
CREATE INDEX "recruiting_duplicate_match_org_level_idx" ON "recruiting_duplicate_match" ("organization_id","level");
--> statement-breakpoint
CREATE INDEX "recruiting_duplicate_match_org_status_idx" ON "recruiting_duplicate_match" ("organization_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_event_record_version_uq" ON "recruiting_event" ("recruiting_record_id","pipeline_version") WHERE "pipeline_version" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "recruiting_event_record_idx" ON "recruiting_event" ("recruiting_record_id");
--> statement-breakpoint
CREATE INDEX "recruiting_event_created_at_idx" ON "recruiting_event" ("created_at");
--> statement-breakpoint
CREATE INDEX "recruiting_event_organization_idx" ON "recruiting_event" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_evidence_snapshot_conversation_hash_uq" ON "recruiting_evidence_snapshot" ("conversation_id","content_hash");
--> statement-breakpoint
CREATE INDEX "recruiting_evidence_snapshot_record_idx" ON "recruiting_evidence_snapshot" ("recruiting_record_id");
--> statement-breakpoint
CREATE INDEX "recruiting_evidence_snapshot_round_idx" ON "recruiting_evidence_snapshot" ("ai_round_id");
--> statement-breakpoint
CREATE INDEX "recruiting_evidence_snapshot_context_idx" ON "recruiting_evidence_snapshot" ("context_snapshot_id");
--> statement-breakpoint
CREATE INDEX "recruiting_evidence_snapshot_organization_idx" ON "recruiting_evidence_snapshot" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_form_submission_template_interview_uq" ON "recruiting_form_submission" ("template_id","recruiting_record_id");
--> statement-breakpoint
CREATE INDEX "recruiting_form_submission_version_idx" ON "recruiting_form_submission" ("version_id");
--> statement-breakpoint
CREATE INDEX "recruiting_form_submission_interview_idx" ON "recruiting_form_submission" ("recruiting_record_id");
--> statement-breakpoint
CREATE INDEX "recruiting_form_submission_organization_idx" ON "recruiting_form_submission" ("organization_id");
--> statement-breakpoint
CREATE INDEX "recruiting_fulfillment_org_joining_idx" ON "recruiting_fulfillment" ("organization_id","expected_joining_date");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_job_match_candidate_run_job_uq" ON "recruiting_job_match_candidate" ("run_id","job_description_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_job_match_candidate_run_ai_rank_uq" ON "recruiting_job_match_candidate" ("run_id","ai_rank");
--> statement-breakpoint
CREATE INDEX "recruiting_job_match_candidate_job_idx" ON "recruiting_job_match_candidate" ("job_description_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_job_match_run_id_org_uq" ON "recruiting_job_match_run" ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_job_match_run_pool_batch_version_uq" ON "recruiting_job_match_run" ("pool_item_id","batch_item_id","matcher_version");
--> statement-breakpoint
CREATE INDEX "recruiting_job_match_run_org_pool_created_idx" ON "recruiting_job_match_run" ("organization_id","pool_item_id","created_at");
--> statement-breakpoint
CREATE INDEX "recruiting_job_match_run_selected_job_idx" ON "recruiting_job_match_run" ("selected_job_description_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_mail_message_id_org_uq" ON "recruiting_mail_message" ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_mail_message_account_mail_uid_uq" ON "recruiting_mail_message" ("account_id","mailbox","uid_validity","uid");
--> statement-breakpoint
CREATE INDEX "recruiting_mail_message_account_status_created_idx" ON "recruiting_mail_message" ("account_id","status","created_at");
--> statement-breakpoint
CREATE INDEX "recruiting_mail_message_batch_idx" ON "recruiting_mail_message" ("batch_id");
--> statement-breakpoint
CREATE INDEX "recruiting_mail_message_account_received_idx" ON "recruiting_mail_message" ("account_id","received_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "recruiting_material_record_kind_idx" ON "recruiting_material" ("organization_id","recruiting_record_id","kind");
--> statement-breakpoint
CREATE INDEX "recruiting_meeting_context_org_record_idx" ON "recruiting_meeting_context" ("organization_id","recruiting_record_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_migration_target_uq" ON "recruiting_migration_map" ("target_table","target_key");
--> statement-breakpoint
CREATE INDEX "recruiting_node_org_node_status_idx" ON "recruiting_node_state" ("organization_id","node","status","recruiting_record_id");
--> statement-breakpoint
CREATE INDEX "recruiting_node_org_node_result_idx" ON "recruiting_node_state" ("organization_id","node","result","recruiting_record_id");
--> statement-breakpoint
CREATE INDEX "recruiting_notification_delivery_recipient_idx" ON "recruiting_notification_delivery" ("recipient_user_id");
--> statement-breakpoint
CREATE INDEX "recruiting_notification_event_idx" ON "recruiting_notification_delivery" ("event_id");
--> statement-breakpoint
CREATE INDEX "recruiting_notification_delivery_delivery_claim_idx" ON "recruiting_notification_delivery" ("status","next_attempt_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_notification_event_channel_recipient_uq" ON "recruiting_notification_delivery" ("event_id","channel","recipient_address") WHERE "event_id" IS NOT NULL AND "channel" IS NOT NULL AND "recipient_address" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_notification_delivery_provider_request_uq" ON "recruiting_notification_delivery" ("provider_request_key") WHERE "provider_request_key" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_notification_delivery_once_uq" ON "recruiting_notification_delivery" ("recruiting_record_id","conversation_id","type","recipient_user_id","provider_id");
--> statement-breakpoint
CREATE INDEX "recruiting_notification_delivery_organization_idx" ON "recruiting_notification_delivery" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_notification_event_id_org_uq" ON "recruiting_notification_event" ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_notification_event_dedupe_uq" ON "recruiting_notification_event" ("dedupe_key");
--> statement-breakpoint
CREATE INDEX "recruiting_notification_event_claim_idx" ON "recruiting_notification_event" ("status","next_attempt_at","available_at");
--> statement-breakpoint
CREATE INDEX "recruiting_notification_event_org_created_idx" ON "recruiting_notification_event" ("organization_id","created_at");
--> statement-breakpoint
CREATE INDEX "recruiting_notification_event_record_created_idx" ON "recruiting_notification_event" ("recruiting_record_id","created_at");
--> statement-breakpoint
CREATE INDEX "recruiting_notification_event_meeting_created_idx" ON "recruiting_notification_event" ("human_meeting_id","created_at");
--> statement-breakpoint
CREATE INDEX "recruiting_notification_recipient_user_idx" ON "recruiting_notification_recipient" ("organization_id","user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_offer_id_record_org_uq" ON "recruiting_offer" ("id","recruiting_record_id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_offer_record_version_uniq" ON "recruiting_offer" ("recruiting_record_id","version");
--> statement-breakpoint
CREATE INDEX "recruiting_offer_org_idx" ON "recruiting_offer" ("organization_id");
--> statement-breakpoint
CREATE INDEX "recruiting_offer_status_idx" ON "recruiting_offer" ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_pool_import_pool_org_record_uq" ON "recruiting_pool_import" ("pool_item_id","organization_id","recruiting_record_id");
--> statement-breakpoint
CREATE INDEX "recruiting_pool_import_pool_org_idx" ON "recruiting_pool_import" ("pool_item_id","organization_id");
--> statement-breakpoint
CREATE INDEX "recruiting_pool_import_record_idx" ON "recruiting_pool_import" ("recruiting_record_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_question_template_binding_interview_template_uq" ON "recruiting_question_template_binding" ("recruiting_record_id","template_id");
--> statement-breakpoint
CREATE INDEX "recruiting_question_template_binding_template_idx" ON "recruiting_question_template_binding" ("template_id");
--> statement-breakpoint
CREATE INDEX "recruiting_question_template_binding_version_idx" ON "recruiting_question_template_binding" ("version_id");
--> statement-breakpoint
CREATE INDEX "recruiting_question_template_binding_organization_idx" ON "recruiting_question_template_binding" ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_record_id_org_uq" ON "recruiting_record" ("id","organization_id");
--> statement-breakpoint
CREATE INDEX "recruiting_record_org_stage_time_idx" ON "recruiting_record" ("organization_id","current_stage","stage_entered_at");
--> statement-breakpoint
CREATE INDEX "recruiting_record_org_outcome_reason_idx" ON "recruiting_record" ("organization_id","outcome","close_reason");
--> statement-breakpoint
CREATE INDEX "recruiting_record_org_creator_created_idx" ON "recruiting_record" ("organization_id","created_by","created_at");
--> statement-breakpoint
CREATE INDEX "recruiting_record_org_owner_stage_idx" ON "recruiting_record" ("organization_id","owner_id","current_stage");
--> statement-breakpoint
CREATE INDEX "recruiting_record_org_job_idx" ON "recruiting_record" ("organization_id","job_description_id");
--> statement-breakpoint
CREATE INDEX "recruiting_record_candidate_idx" ON "recruiting_record" ("candidate_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_evaluation_id_record_org_uq" ON "recruiting_resume_evaluation" ("id","recruiting_record_id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_evaluation_run_uq" ON "recruiting_resume_evaluation" ("recruiting_record_id","kind","contract_version","run_id") WHERE "run_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "recruiting_evaluation_org_level_idx" ON "recruiting_resume_evaluation" ("organization_id","recommendation_level");
--> statement-breakpoint
CREATE INDEX "recruiting_evaluation_record_created_idx" ON "recruiting_resume_evaluation" ("recruiting_record_id","created_at");
--> statement-breakpoint
CREATE INDEX "recruiting_round_email_log_organization_idx" ON "recruiting_round_email_log" ("organization_id");
--> statement-breakpoint
CREATE INDEX "recruiting_round_email_log_round_created_idx" ON "recruiting_round_email_log" ("round_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_search_index_source_version_uq" ON "recruiting_search_index" ("source_type","source_id","embedding_version");
--> statement-breakpoint
CREATE INDEX "recruiting_search_index_org_status_idx" ON "recruiting_search_index" ("organization_id","status");
--> statement-breakpoint
CREATE INDEX "recruiting_search_index_org_source_idx" ON "recruiting_search_index" ("organization_id","source_type","source_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_upload_batch_id_org_uq" ON "recruiting_upload_batch" ("id","organization_id");
--> statement-breakpoint
CREATE INDEX "recruiting_upload_batch_org_user_status_idx" ON "recruiting_upload_batch" ("organization_id","created_by","status");
--> statement-breakpoint
CREATE INDEX "recruiting_upload_batch_org_user_created_idx" ON "recruiting_upload_batch" ("organization_id","created_by","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_upload_batch_item_id_org_uq" ON "recruiting_upload_batch_item" ("id","organization_id");
--> statement-breakpoint
CREATE INDEX "recruiting_upload_batch_item_batch_order_idx" ON "recruiting_upload_batch_item" ("batch_id","order_index");
--> statement-breakpoint
CREATE INDEX "recruiting_upload_batch_item_batch_status_idx" ON "recruiting_upload_batch_item" ("batch_id","status");
--> statement-breakpoint
ALTER TABLE "ai_interview_conversation" ADD CONSTRAINT "ai_interview_conversation_ai_round_id_owner_fk" FOREIGN KEY ("ai_round_id","recruiting_record_id","organization_id") REFERENCES "ai_interview_round"("id","recruiting_record_id","organization_id");
--> statement-breakpoint
ALTER TABLE "ai_interview_conversation" ADD CONSTRAINT "ai_interview_conversation_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ai_interview_conversation" ADD CONSTRAINT "ai_interview_conversation_recruiting_record_id_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id");
--> statement-breakpoint
ALTER TABLE "ai_interview_conversation" ADD CONSTRAINT "ai_interview_conversation_ai_round_id_org_fk" FOREIGN KEY ("ai_round_id","organization_id") REFERENCES "ai_interview_round"("id","organization_id");
--> statement-breakpoint
ALTER TABLE "ai_interview_conversation_turn" ADD CONSTRAINT "ai_interview_conversation_turn_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ai_interview_conversation_turn" ADD CONSTRAINT "ai_interview_conversation_turn_conversation_id_org_fk" FOREIGN KEY ("conversation_id","organization_id") REFERENCES "ai_interview_conversation"("conversation_id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ai_interview_conversation_turn" ADD CONSTRAINT "ai_interview_conversation_turn_recruiting_record_id_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id");
--> statement-breakpoint
ALTER TABLE "ai_interview_round" ADD CONSTRAINT "ai_round_current_conversation_fk" FOREIGN KEY ("conversation_id","id","organization_id") REFERENCES "ai_interview_conversation"("conversation_id","ai_round_id","organization_id");
--> statement-breakpoint
ALTER TABLE "ai_interview_round" ADD CONSTRAINT "ai_interview_round_reviewed_by_fk" FOREIGN KEY ("reviewed_by") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "ai_interview_round" ADD CONSTRAINT "ai_interview_round_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "ai_interview_round" ADD CONSTRAINT "ai_interview_round_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "ai_interview_round" ADD CONSTRAINT "ai_interview_round_recruiting_record_id_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "candidate" ADD CONSTRAINT "candidate_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "candidate" ADD CONSTRAINT "candidate_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "candidate_resume" ADD CONSTRAINT "candidate_resume_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "candidate_resume" ADD CONSTRAINT "candidate_resume_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "candidate_resume" ADD CONSTRAINT "candidate_resume_candidate_org_fk" FOREIGN KEY ("candidate_id","organization_id") REFERENCES "candidate"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "human_interview_evaluation_document_sync" ADD CONSTRAINT "human_interview_evaluation_document_sync_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "human_interview_evaluation_document_sync" ADD CONSTRAINT "human_interview_evaluation_document_sync_round_id_org_fk" FOREIGN KEY ("round_id","organization_id") REFERENCES "human_interview_round"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "human_interview_evaluation_document_sync" ADD CONSTRAINT "human_interview_evaluation_document_sync_snapshot_id_org_fk" FOREIGN KEY ("snapshot_id","organization_id") REFERENCES "human_interview_evaluation_snapshot"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "human_interview_evaluation_snapshot" ADD CONSTRAINT "human_interview_evaluation_snapshot_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "human_interview_evaluation_snapshot" ADD CONSTRAINT "human_interview_evaluation_snapshot_meeting_session_id_fk" FOREIGN KEY ("meeting_session_id") REFERENCES "meeting_session"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "human_interview_evaluation_snapshot" ADD CONSTRAINT "human_interview_evaluation_snapshot_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "human_interview_evaluation_snapshot" ADD CONSTRAINT "human_interview_evaluation_snapshot_transcript_revision_id_fk" FOREIGN KEY ("transcript_revision_id") REFERENCES "meeting_transcript_revision"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "human_interview_evaluation_snapshot" ADD CONSTRAINT "human_interview_evaluation_snapshot_round_id_org_fk" FOREIGN KEY ("round_id","organization_id") REFERENCES "human_interview_round"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "human_interview_meeting" ADD CONSTRAINT "human_interview_meeting_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "human_interview_meeting" ADD CONSTRAINT "human_interview_meeting_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "human_interview_meeting" ADD CONSTRAINT "human_interview_meeting_processing_meeting_session_id_fk" FOREIGN KEY ("processing_meeting_session_id") REFERENCES "meeting_session"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "human_interview_meeting_event" ADD CONSTRAINT "human_interview_meeting_event_meeting_id_org_fk" FOREIGN KEY ("meeting_id","organization_id") REFERENCES "human_interview_meeting"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "human_interview_meeting_event" ADD CONSTRAINT "human_interview_meeting_event_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "human_interview_meeting_interviewer" ADD CONSTRAINT "human_interview_meeting_interviewer_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "human_interview_meeting_interviewer" ADD CONSTRAINT "human_interview_meeting_interviewer_meeting_id_org_fk" FOREIGN KEY ("meeting_id","organization_id") REFERENCES "human_interview_meeting"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "human_interview_meeting_interviewer" ADD CONSTRAINT "human_interview_meeting_interviewer_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "human_interview_meeting_round" ADD CONSTRAINT "human_interview_meeting_round_meeting_id_org_fk" FOREIGN KEY ("meeting_id","organization_id") REFERENCES "human_interview_meeting"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "human_interview_meeting_round" ADD CONSTRAINT "human_interview_meeting_round_round_id_org_fk" FOREIGN KEY ("round_id","organization_id") REFERENCES "human_interview_round"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "human_interview_meeting_round" ADD CONSTRAINT "human_interview_meeting_round_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "human_interview_round" ADD CONSTRAINT "human_interview_round_evaluation_transcript_revision_id_fk" FOREIGN KEY ("evaluation_transcript_revision_id") REFERENCES "meeting_transcript_revision"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "human_interview_round" ADD CONSTRAINT "human_interview_round_evaluation_updated_by_fk" FOREIGN KEY ("evaluation_updated_by") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "human_interview_round" ADD CONSTRAINT "human_interview_round_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "human_interview_round" ADD CONSTRAINT "human_interview_round_recruiting_record_id_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "human_interview_round_interviewer" ADD CONSTRAINT "human_interview_round_interviewer_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "human_interview_round_interviewer" ADD CONSTRAINT "human_interview_round_interviewer_round_id_org_fk" FOREIGN KEY ("round_id","organization_id") REFERENCES "human_interview_round"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "human_interview_round_interviewer" ADD CONSTRAINT "human_interview_round_interviewer_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_context_snapshot" ADD CONSTRAINT "recruiting_context_snapshot_ai_round_id_owner_fk" FOREIGN KEY ("ai_round_id","recruiting_record_id","organization_id") REFERENCES "ai_interview_round"("id","recruiting_record_id","organization_id");
--> statement-breakpoint
ALTER TABLE "recruiting_context_snapshot" ADD CONSTRAINT "recruiting_context_snapshot_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_context_snapshot" ADD CONSTRAINT "recruiting_context_snapshot_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_context_snapshot" ADD CONSTRAINT "recruiting_context_snapshot_recruiting_record_id_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_duplicate_match" ADD CONSTRAINT "recruiting_duplicate_match_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_event" ADD CONSTRAINT "recruiting_event_ai_round_id_owner_fk" FOREIGN KEY ("ai_round_id","recruiting_record_id","organization_id") REFERENCES "ai_interview_round"("id","recruiting_record_id","organization_id");
--> statement-breakpoint
ALTER TABLE "recruiting_event" ADD CONSTRAINT "recruiting_event_operator_id_fk" FOREIGN KEY ("operator_id") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_event" ADD CONSTRAINT "recruiting_event_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_event" ADD CONSTRAINT "recruiting_event_recruiting_record_id_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_evidence_snapshot" ADD CONSTRAINT "recruiting_evidence_snapshot_context_snapshot_id_owner_fk" FOREIGN KEY ("context_snapshot_id","recruiting_record_id","organization_id") REFERENCES "recruiting_context_snapshot"("id","recruiting_record_id","organization_id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "recruiting_evidence_snapshot" ADD CONSTRAINT "recruiting_evidence_snapshot_ai_round_id_owner_fk" FOREIGN KEY ("ai_round_id","recruiting_record_id","organization_id") REFERENCES "ai_interview_round"("id","recruiting_record_id","organization_id");
--> statement-breakpoint
ALTER TABLE "recruiting_evidence_snapshot" ADD CONSTRAINT "recruiting_evidence_snapshot_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_evidence_snapshot" ADD CONSTRAINT "recruiting_evidence_snapshot_conversation_id_org_fk" FOREIGN KEY ("conversation_id","organization_id") REFERENCES "ai_interview_conversation"("conversation_id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_evidence_snapshot" ADD CONSTRAINT "recruiting_evidence_snapshot_recruiting_record_id_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_form_submission" ADD CONSTRAINT "recruiting_form_submission_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_form_submission" ADD CONSTRAINT "recruiting_form_submission_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "candidate_form_template"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "recruiting_form_submission" ADD CONSTRAINT "recruiting_form_submission_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "candidate_form_template_version"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "recruiting_form_submission" ADD CONSTRAINT "recruiting_form_submission_recruiting_record_id_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_fulfillment" ADD CONSTRAINT "recruiting_fulfillment_onboarding_confirmed_by_fk" FOREIGN KEY ("onboarding_confirmed_by") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_fulfillment" ADD CONSTRAINT "recruiting_fulfillment_record_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_fulfillment" ADD CONSTRAINT "recruiting_fulfillment_offer_owner_fk" FOREIGN KEY ("selected_offer_id","recruiting_record_id","organization_id") REFERENCES "recruiting_offer"("id","recruiting_record_id","organization_id");
--> statement-breakpoint
ALTER TABLE "recruiting_interview_preparation" ADD CONSTRAINT "recruiting_preparation_record_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_job_match_candidate" ADD CONSTRAINT "recruiting_job_match_candidate_job_description_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "job_description"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_job_match_candidate" ADD CONSTRAINT "recruiting_job_match_candidate_run_id_org_fk" FOREIGN KEY ("run_id","organization_id") REFERENCES "recruiting_job_match_run"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_job_match_candidate" ADD CONSTRAINT "recruiting_job_match_candidate_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_job_match_run" ADD CONSTRAINT "recruiting_job_match_run_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_job_match_run" ADD CONSTRAINT "recruiting_job_match_run_pool_item_id_fk" FOREIGN KEY ("pool_item_id") REFERENCES "resume_pool_item"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_job_match_run" ADD CONSTRAINT "recruiting_job_match_run_selected_job_description_id_fk" FOREIGN KEY ("selected_job_description_id") REFERENCES "job_description"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_job_match_run" ADD CONSTRAINT "recruiting_job_match_run_batch_item_id_org_fk" FOREIGN KEY ("batch_item_id","organization_id") REFERENCES "recruiting_upload_batch_item"("id","organization_id");
--> statement-breakpoint
ALTER TABLE "recruiting_job_match_run" ADD CONSTRAINT "recruiting_job_match_run_mail_message_id_org_fk" FOREIGN KEY ("mail_message_id","organization_id") REFERENCES "recruiting_mail_message"("id","organization_id");
--> statement-breakpoint
ALTER TABLE "recruiting_mail_message" ADD CONSTRAINT "recruiting_mail_message_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "mail_ingest_account"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_mail_message" ADD CONSTRAINT "recruiting_mail_message_bound_job_description_id_fk" FOREIGN KEY ("bound_job_description_id") REFERENCES "job_description"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_mail_message" ADD CONSTRAINT "recruiting_mail_message_batch_id_org_fk" FOREIGN KEY ("batch_id","organization_id") REFERENCES "recruiting_upload_batch"("id","organization_id");
--> statement-breakpoint
ALTER TABLE "recruiting_mail_message" ADD CONSTRAINT "recruiting_mail_message_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_material" ADD CONSTRAINT "recruiting_material_uploaded_by_fk" FOREIGN KEY ("uploaded_by") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_material" ADD CONSTRAINT "recruiting_material_record_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_meeting_context" ADD CONSTRAINT "recruiting_meeting_context_linked_by_fk" FOREIGN KEY ("linked_by") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_meeting_context" ADD CONSTRAINT "recruiting_meeting_context_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_meeting_context" ADD CONSTRAINT "recruiting_meeting_context_recruiting_record_id_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_meeting_context" ADD CONSTRAINT "recruiting_meeting_context_meeting_org_fk" FOREIGN KEY ("meeting_id","organization_id") REFERENCES "meeting_session"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_node_state" ADD CONSTRAINT "recruiting_node_state_decided_by_fk" FOREIGN KEY ("decided_by") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_node_state" ADD CONSTRAINT "recruiting_node_record_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_node_state" ADD CONSTRAINT "recruiting_node_ai_owner_fk" FOREIGN KEY ("effective_ai_round_id","recruiting_record_id","organization_id") REFERENCES "ai_interview_round"("id","recruiting_record_id","organization_id");
--> statement-breakpoint
ALTER TABLE "recruiting_node_state" ADD CONSTRAINT "recruiting_node_human_owner_fk" FOREIGN KEY ("effective_human_round_id","recruiting_record_id","organization_id","node") REFERENCES "human_interview_round"("id","recruiting_record_id","organization_id","round_kind");
--> statement-breakpoint
ALTER TABLE "recruiting_node_state" ADD CONSTRAINT "recruiting_node_offer_owner_fk" FOREIGN KEY ("effective_offer_id","recruiting_record_id","organization_id") REFERENCES "recruiting_offer"("id","recruiting_record_id","organization_id");
--> statement-breakpoint
ALTER TABLE "recruiting_notification_delivery" ADD CONSTRAINT "recruiting_notification_delivery_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_notification_delivery" ADD CONSTRAINT "recruiting_notification_delivery_recipient_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_notification_delivery" ADD CONSTRAINT "recruiting_notification_delivery_template_version_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "interview_notification_template_version"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_notification_delivery" ADD CONSTRAINT "recruiting_notification_delivery_conversation_id_org_fk" FOREIGN KEY ("conversation_id","organization_id") REFERENCES "ai_interview_conversation"("conversation_id","organization_id");
--> statement-breakpoint
ALTER TABLE "recruiting_notification_delivery" ADD CONSTRAINT "recruiting_notification_delivery_event_id_org_fk" FOREIGN KEY ("event_id","organization_id") REFERENCES "recruiting_notification_event"("id","organization_id");
--> statement-breakpoint
ALTER TABLE "recruiting_notification_delivery" ADD CONSTRAINT "recruiting_notification_delivery_recruiting_record_id_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_notification_event" ADD CONSTRAINT "recruiting_notification_event_human_round_id_owner_fk" FOREIGN KEY ("human_round_id","recruiting_record_id","organization_id") REFERENCES "human_interview_round"("id","recruiting_record_id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_notification_event" ADD CONSTRAINT "recruiting_notification_event_ai_round_id_owner_fk" FOREIGN KEY ("ai_round_id","recruiting_record_id","organization_id") REFERENCES "ai_interview_round"("id","recruiting_record_id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_notification_event" ADD CONSTRAINT "recruiting_notification_event_actor_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_notification_event" ADD CONSTRAINT "recruiting_notification_event_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_notification_event" ADD CONSTRAINT "recruiting_notification_event_conversation_id_org_fk" FOREIGN KEY ("conversation_id","organization_id") REFERENCES "ai_interview_conversation"("conversation_id","organization_id");
--> statement-breakpoint
ALTER TABLE "recruiting_notification_event" ADD CONSTRAINT "recruiting_notification_event_human_meeting_id_org_fk" FOREIGN KEY ("human_meeting_id","organization_id") REFERENCES "human_interview_meeting"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_notification_event" ADD CONSTRAINT "recruiting_notification_event_human_round_id_org_fk" FOREIGN KEY ("human_round_id","organization_id") REFERENCES "human_interview_round"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_notification_event" ADD CONSTRAINT "recruiting_notification_event_recruiting_record_id_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_notification_event" ADD CONSTRAINT "recruiting_notification_event_ai_round_id_org_fk" FOREIGN KEY ("ai_round_id","organization_id") REFERENCES "ai_interview_round"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_notification_recipient" ADD CONSTRAINT "recruiting_notification_recipient_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_notification_recipient" ADD CONSTRAINT "recruiting_notification_recipient_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_notification_recipient" ADD CONSTRAINT "recruiting_notification_recipient_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_notification_recipient" ADD CONSTRAINT "recruiting_notification_recipient_recruiting_record_id_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_notification_recipient" ADD CONSTRAINT "recruiting_notification_recipient_member_org_fk" FOREIGN KEY ("user_id","organization_id") REFERENCES "member"("user_id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_offer" ADD CONSTRAINT "recruiting_offer_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_offer" ADD CONSTRAINT "recruiting_offer_recruiting_record_id_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_pool_import" ADD CONSTRAINT "recruiting_pool_import_imported_by_fk" FOREIGN KEY ("imported_by") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_pool_import" ADD CONSTRAINT "recruiting_pool_import_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_pool_import" ADD CONSTRAINT "recruiting_pool_import_pool_item_id_fk" FOREIGN KEY ("pool_item_id") REFERENCES "resume_pool_item"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_pool_import" ADD CONSTRAINT "recruiting_pool_import_recruiting_record_id_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_question_template_binding" ADD CONSTRAINT "recruiting_question_template_binding_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_question_template_binding" ADD CONSTRAINT "recruiting_question_template_binding_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "interview_question_template"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "recruiting_question_template_binding" ADD CONSTRAINT "recruiting_question_template_binding_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "interview_question_template_version"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "recruiting_question_template_binding" ADD CONSTRAINT "recruiting_question_template_binding_recruiting_rec_bc995636" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_record" ADD CONSTRAINT "recruiting_record_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_record" ADD CONSTRAINT "recruiting_record_job_description_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "job_description"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_record" ADD CONSTRAINT "recruiting_record_hr_resume_assessment_updated_by_fk" FOREIGN KEY ("hr_resume_assessment_updated_by") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_record" ADD CONSTRAINT "recruiting_record_source_pool_item_id_fk" FOREIGN KEY ("source_pool_item_id") REFERENCES "resume_pool_item"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_record" ADD CONSTRAINT "recruiting_record_source_imported_by_fk" FOREIGN KEY ("source_imported_by") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_record" ADD CONSTRAINT "recruiting_record_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_record" ADD CONSTRAINT "recruiting_record_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_record" ADD CONSTRAINT "recruiting_record_candidate_org_fk" FOREIGN KEY ("candidate_id","organization_id") REFERENCES "candidate"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_record" ADD CONSTRAINT "recruiting_record_resume_owner_fk" FOREIGN KEY ("resume_id","candidate_id","organization_id") REFERENCES "candidate_resume"("id","candidate_id","organization_id");
--> statement-breakpoint
ALTER TABLE "recruiting_record" ADD CONSTRAINT "recruiting_record_current_evaluation_fk" FOREIGN KEY ("current_evaluation_id","id","organization_id") REFERENCES "recruiting_resume_evaluation"("id","recruiting_record_id","organization_id");
--> statement-breakpoint
ALTER TABLE "recruiting_record" ADD CONSTRAINT "recruiting_record_active_evaluation_fk" FOREIGN KEY ("active_evaluation_id","id","organization_id") REFERENCES "recruiting_resume_evaluation"("id","recruiting_record_id","organization_id");
--> statement-breakpoint
ALTER TABLE "recruiting_resume_evaluation" ADD CONSTRAINT "recruiting_resume_evaluation_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_resume_evaluation" ADD CONSTRAINT "recruiting_resume_evaluation_job_description_version_id_fk" FOREIGN KEY ("job_description_version_id") REFERENCES "job_description_version"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_resume_evaluation" ADD CONSTRAINT "recruiting_resume_evaluation_resume_id_org_fk" FOREIGN KEY ("resume_id","organization_id") REFERENCES "candidate_resume"("id","organization_id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "recruiting_resume_evaluation" ADD CONSTRAINT "recruiting_evaluation_record_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_round_email_log" ADD CONSTRAINT "recruiting_round_email_log_round_id_owner_fk" FOREIGN KEY ("round_id","recruiting_record_id","organization_id") REFERENCES "ai_interview_round"("id","recruiting_record_id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_round_email_log" ADD CONSTRAINT "recruiting_round_email_log_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_round_email_log" ADD CONSTRAINT "recruiting_round_email_log_sent_by_fk" FOREIGN KEY ("sent_by") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_round_email_log" ADD CONSTRAINT "recruiting_round_email_log_recruiting_record_id_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_search_index" ADD CONSTRAINT "recruiting_search_index_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_upload_batch" ADD CONSTRAINT "recruiting_upload_batch_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_upload_batch" ADD CONSTRAINT "recruiting_upload_batch_job_description_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "job_description"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_upload_batch" ADD CONSTRAINT "recruiting_upload_batch_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_upload_batch_item" ADD CONSTRAINT "recruiting_upload_batch_item_pool_item_id_fk" FOREIGN KEY ("pool_item_id") REFERENCES "resume_pool_item"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "recruiting_upload_batch_item" ADD CONSTRAINT "recruiting_upload_batch_item_batch_id_org_fk" FOREIGN KEY ("batch_id","organization_id") REFERENCES "recruiting_upload_batch"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recruiting_upload_batch_item" ADD CONSTRAINT "recruiting_upload_batch_item_recruiting_record_id_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id");
