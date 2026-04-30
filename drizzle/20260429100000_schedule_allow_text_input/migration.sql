-- 面试轮次新增"允许文本输入"开关；关闭时面试界面文本输入框被禁用。
-- Add per-round "allow text input" toggle; when off, the interview text input
-- is rendered disabled.

ALTER TABLE "studio_interview_schedule"
  ADD COLUMN "allow_text_input" boolean NOT NULL DEFAULT false;
