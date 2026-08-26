-- HR 已通过 human_invitation_accepted 收到候选人反馈；正式确认事件只发候选人和面试官，避免 HR 重复收件。
UPDATE "interview_notification_template"
SET "enabled" = false,
    "updated_at" = now()
WHERE "event_type" = 'human_interview_confirmed'
  AND "audience_type" IN ('selected_hr_user', 'initiator_fallback');
