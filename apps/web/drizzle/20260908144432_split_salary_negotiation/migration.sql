-- 调用方必须在同一事务执行；迁移锁阻止旧进程并发推进。
LOCK TABLE recruiting_record, recruiting_node_state, recruiting_offer IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
ALTER TABLE "recruiting_node_state" DROP CONSTRAINT "recruiting_node_kind_check", ADD CONSTRAINT "recruiting_node_kind_check" CHECK ("node" IN ('screening', 'ai_interview', 'second_interview', 'final_interview', 'income_proof', 'salary_negotiation', 'offer', 'background_check', 'onboarding'));
--> statement-breakpoint
ALTER TABLE "recruiting_record" DROP CONSTRAINT "recruiting_record_stage_check", ADD CONSTRAINT "recruiting_record_stage_check" CHECK ("current_stage" IN ('screening', 'ai_interview', 'second_interview', 'final_interview', 'income_proof', 'salary_negotiation', 'offer', 'background_check', 'onboarding', 'closed'));
--> statement-breakpoint
ALTER TABLE "recruiting_record" DROP CONSTRAINT "recruiting_record_closed_node_check", ADD CONSTRAINT "recruiting_record_closed_node_check" CHECK ("closed_from_node" IS NULL OR "closed_from_node" IN ('screening', 'ai_interview', 'second_interview', 'final_interview', 'income_proof', 'salary_negotiation', 'offer', 'background_check', 'onboarding'));
--> statement-breakpoint
ALTER TABLE "recruiting_node_state" DROP CONSTRAINT "recruiting_node_progress_check";
--> statement-breakpoint
-- 保存旧节点归属，结束记录优先取关闭前进度；旧谈薪草稿继续保留在发 Offer 节点，完成谈薪后复用。
CREATE TEMP TABLE salary_split_mapping ON COMMIT DROP AS
SELECT r.id, r.organization_id,
  CASE WHEN (r.current_stage = 'offer' OR r.closed_from_node = 'offer')
    AND (r.close_reason = 'salary_disagreement' OR COALESCE(
      CASE WHEN r.current_stage = 'closed' THEN COALESCE(r.close_details->>'previousNodeStatus',
        (SELECT previous_node->>'status' FROM recruiting_event e,
          jsonb_array_elements(COALESCE(e.detail->'previousNodes', '[]'::jsonb)) previous_node
         WHERE e.recruiting_record_id = r.id AND e.organization_id = r.organization_id
           AND e.action = 'recruiting_closed' AND previous_node->>'node' = 'offer'
         ORDER BY e.pipeline_version DESC NULLS LAST, e.created_at DESC LIMIT 1)) ELSE n.status END,
      'pending') IN ('pending','negotiating','in_progress','awaiting_review'))
    THEN true ELSE false END AS move_to_salary
FROM recruiting_record r JOIN recruiting_node_state n ON n.recruiting_record_id = r.id AND n.node = 'offer';
--> statement-breakpoint
INSERT INTO recruiting_node_state (recruiting_record_id, organization_id, node, status, result,
 entered_at, completed_at, decided_at, decided_by, reason)
SELECT r.id, r.organization_id, 'salary_negotiation',
 CASE WHEN m.move_to_salary THEN n.status
      WHEN n.status IN ('completed','awaiting_send','awaiting_response','negotiating') OR n.effective_offer_id IS NOT NULL
        OR r.current_stage IN ('background_check','onboarding') OR r.closed_from_node IN ('background_check','onboarding') THEN 'completed'
      WHEN n.status = 'skipped' THEN 'skipped' ELSE 'inactive' END,
 CASE WHEN m.move_to_salary THEN n.result
      WHEN n.status IN ('completed','awaiting_send','awaiting_response','negotiating') OR n.effective_offer_id IS NOT NULL
        OR r.current_stage IN ('background_check','onboarding') OR r.closed_from_node IN ('background_check','onboarding') THEN 'pass' ELSE NULL END,
 n.entered_at, CASE WHEN m.move_to_salary THEN n.completed_at ELSE COALESCE(n.entered_at,n.completed_at) END,
 CASE WHEN m.move_to_salary THEN n.decided_at ELSE NULL END,
 CASE WHEN m.move_to_salary THEN n.decided_by ELSE NULL END,
 CASE WHEN m.move_to_salary THEN n.reason ELSE '由原谈薪发 Offer 节点拆分回填' END
FROM recruiting_record r JOIN recruiting_node_state n ON n.recruiting_record_id = r.id AND n.node = 'offer'
JOIN salary_split_mapping m ON m.id = r.id
ON CONFLICT (recruiting_record_id,node) DO NOTHING;
--> statement-breakpoint
UPDATE recruiting_node_state n SET status=CASE WHEN n.effective_offer_id IS NULL THEN 'inactive' ELSE 'awaiting_send' END, result=NULL, entered_at=NULL, completed_at=NULL,
 decided_at=NULL, decided_by=NULL, reason=NULL
FROM salary_split_mapping m WHERE n.recruiting_record_id=m.id AND n.node='offer' AND m.move_to_salary;
--> statement-breakpoint
UPDATE recruiting_node_state n SET status=CASE WHEN o.sent_at IS NOT NULL THEN 'awaiting_response' ELSE 'awaiting_send' END
FROM salary_split_mapping m LEFT JOIN recruiting_offer o ON o.recruiting_record_id=m.id
WHERE n.recruiting_record_id=m.id AND n.node='offer' AND n.status='negotiating' AND NOT m.move_to_salary
AND (n.effective_offer_id=o.id OR n.effective_offer_id IS NULL);
--> statement-breakpoint
UPDATE recruiting_record r SET current_stage=CASE WHEN r.current_stage='offer' THEN 'salary_negotiation' ELSE r.current_stage END,
 closed_from_node=CASE WHEN r.closed_from_node='offer' THEN 'salary_negotiation' ELSE r.closed_from_node END,
 version=r.version+1
FROM salary_split_mapping m WHERE r.id=m.id AND m.move_to_salary;
--> statement-breakpoint
ALTER TABLE "recruiting_node_state" ADD CONSTRAINT "recruiting_node_progress_check" CHECK (("status" IN ('inactive', 'pending', 'completed', 'skipped')) OR ("node" IN ('ai_interview', 'second_interview', 'final_interview') AND "status" IN ('scheduled', 'in_progress', 'awaiting_review')) OR ("node" IN ('income_proof', 'background_check') AND "status" IN ('in_progress', 'awaiting_review')) OR ("node" = 'salary_negotiation' AND "status" IN ('negotiating', 'in_progress', 'awaiting_review')) OR ("node" = 'offer' AND "status" IN ('awaiting_send', 'awaiting_response')));
