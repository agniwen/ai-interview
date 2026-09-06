-- 旧招聘档案仅保留内部外键；解除对在线资源的外键，不修改任何行或字段值。
-- 历史约束名称存在差异，按真实源表/目标表定位，避免漏掉旧版名称。
DO $archive_isolation$
DECLARE
  archive_tables text[] := ARRAY['candidate_form_submission', 'human_interview_document_sync', 'interview_audit_log', 'interview_context_snapshot', 'interview_conversation', 'interview_conversation_turn', 'interview_evidence_snapshot', 'interview_notification', 'interview_notification_event', 'interview_question_template_binding', 'mail_ingest_message', 'meeting_recruiting_context', 'resume_duplicate_match', 'resume_evaluation_failure', 'resume_evaluation_version', 'resume_job_match_candidate', 'resume_job_match_run', 'resume_pool_import', 'resume_semantic_index', 'resume_upload_batch', 'resume_upload_batch_item', 'studio_human_interview_evaluation_snapshot', 'studio_human_interview_meeting', 'studio_human_interview_meeting_event', 'studio_human_interview_meeting_interviewer', 'studio_human_interview_meeting_round', 'studio_human_interview_round', 'studio_human_interview_round_interviewer', 'studio_interview', 'studio_interview_notification_recipient', 'studio_interview_schedule', 'studio_offer_draft', 'studio_round_email_log'];
  old_reference record;
BEGIN
  FOR old_reference IN
    SELECT source_ns.nspname AS source_schema, source.relname AS source_table, c.conname
    FROM pg_constraint c
    JOIN pg_class source ON source.oid = c.conrelid
    JOIN pg_namespace source_ns ON source_ns.oid = source.relnamespace
    JOIN pg_class target ON target.oid = c.confrelid
    JOIN pg_namespace target_ns ON target_ns.oid = target.relnamespace
    WHERE c.contype = 'f' AND source_ns.nspname = 'public'
      AND source.relname = ANY(archive_tables)
      AND NOT (target_ns.nspname = 'public' AND target.relname = ANY(archive_tables))
    ORDER BY source.relname, c.conname
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',
      old_reference.source_schema, old_reference.source_table, old_reference.conname);
  END LOOP;
END
$archive_isolation$;
