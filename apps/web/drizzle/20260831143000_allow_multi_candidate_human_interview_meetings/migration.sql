-- A human interview meeting can include multiple candidate rounds. Some existing
-- databases retained this obsolete one-meeting-to-one-round index even though the
-- junction table uses (meeting_id, round_id) as its primary key.
DROP INDEX IF EXISTS "studio_human_interview_meeting_round_meeting_uq";
