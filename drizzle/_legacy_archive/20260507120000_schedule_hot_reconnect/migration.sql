-- 热重连：在轮次行上持久化 LiveKit 房间名/参与者 identity/会话起始时间，
-- 以及最近一次硬断连时刻；候选人可在 3 分钟宽限期内回到同一房间继续。
-- Hot reconnect: persist LiveKit room/identity/session start and the latest
-- hard-disconnect timestamp on the schedule row so a candidate can rejoin the
-- same room within a 3-minute grace window.

ALTER TABLE "studio_interview_schedule"
  ADD COLUMN IF NOT EXISTS "livekit_room_name" text,
  ADD COLUMN IF NOT EXISTS "livekit_participant_identity" text,
  ADD COLUMN IF NOT EXISTS "session_started_at" timestamp,
  ADD COLUMN IF NOT EXISTS "disconnected_at" timestamp;
