-- 保留旧行；将旧版报告原文归档到新事件，不提升为当前面试结论，不重发文档或通知。
DO $retire_archive$
DECLARE
  legacy_row record;
  dependency record;
  event_id text;
  event_detail jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('retire_recruiting_archive_dependencies'));
  IF to_regclass('public.interview_report') IS NOT NULL
     OR to_regclass('public.interview_report_version') IS NOT NULL THEN
    IF to_regclass('public.interview_report') IS NULL
       OR to_regclass('public.interview_report_version') IS NULL THEN
      RAISE EXCEPTION 'Legacy report tables incomplete; inspect before retirement';
    END IF;
    LOCK TABLE public.interview_report, public.interview_report_version IN SHARE MODE;
    FOR legacy_row IN EXECUTE $query$
      SELECT 'interview_report'::text AS source_table, r.id AS source_id,
             r.interview_record_id AS record_id, r.organization_id, to_jsonb(r) AS payload
      FROM public.interview_report r
      UNION ALL
      SELECT 'interview_report_version', v.id, r.interview_record_id, r.organization_id, to_jsonb(v)
      FROM public.interview_report_version v LEFT JOIN public.interview_report r ON r.id = v.report_id
    $query$
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.recruiting_record
        WHERE id = legacy_row.record_id AND organization_id = legacy_row.organization_id) THEN
        RAISE EXCEPTION 'Report archive has no matching new recruiting record: %/%', legacy_row.source_table, legacy_row.source_id;
      END IF;
      event_id := 'archive-report-' || md5(legacy_row.source_table || ':' || legacy_row.source_id);
      event_detail := jsonb_build_object('sourceTable', legacy_row.source_table,
        'sourceId', legacy_row.source_id, 'legacySource', legacy_row.payload,
        'archivalReason', '旧版报告完整保留，仅供历史审计，不作为当前面试结论');
      INSERT INTO public.recruiting_event (id, action, recruiting_record_id, organization_id, detail)
      VALUES (event_id, 'migration.report_archived', legacy_row.record_id, legacy_row.organization_id, event_detail)
      ON CONFLICT (id) DO NOTHING;
      IF NOT EXISTS (SELECT 1 FROM public.recruiting_event WHERE id = event_id
        AND action = 'migration.report_archived' AND recruiting_record_id = legacy_row.record_id
        AND organization_id = legacy_row.organization_id AND detail = event_detail) THEN
        RAISE EXCEPTION 'Report archive conflict; refusing to overwrite %', event_id;
      END IF;
    END LOOP;
  END IF;

  -- 开发库该表为空。其他环境有数据时必须先明确邀请归档映射，不静默略过。
  IF to_regclass('public.studio_human_interview_interviewer_invitation') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.studio_human_interview_interviewer_invitation IN SHARE MODE';
    IF EXISTS (SELECT 1 FROM public.studio_human_interview_interviewer_invitation) THEN
      RAISE EXCEPTION 'Legacy interviewer invitations require data migration before retirement';
    END IF;
  END IF;

  -- 这三张表都是未纳入原清单的历史档案，解除全部外键（含档案内部和在线资源）。
  FOR dependency IN
    SELECT c.conname, n.nspname, t.relname FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f' AND n.nspname = 'public'
      AND t.relname IN ('interview_report', 'interview_report_version', 'studio_human_interview_interviewer_invitation')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', dependency.nspname, dependency.relname, dependency.conname);
  END LOOP;

  IF to_regclass('public.studio_interview') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS studio_interview_skill_count_decrement ON public.studio_interview;
    DROP TRIGGER IF EXISTS studio_interview_sync_search ON public.studio_interview;
  END IF;
  -- 共享触发器函数仍可能供其他表使用，不删除函数。
END
$retire_archive$;
