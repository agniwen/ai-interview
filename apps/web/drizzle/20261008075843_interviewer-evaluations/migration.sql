CREATE TABLE "human_interview_reviewer_evaluation" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"round_id" text NOT NULL,
	"reviewer_id" text,
	"evaluation" jsonb NOT NULL,
	"outcome" text,
	"submitted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"legacy" boolean DEFAULT false NOT NULL,
	CONSTRAINT "human_interview_reviewer_evaluation_version_check" CHECK ("version" > 0),
	CONSTRAINT "human_interview_reviewer_evaluation_outcome_check" CHECK ("outcome" in ('pass', 'fail', 'inconclusive'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "human_interview_reviewer_evaluation_round_reviewer_uq" ON "human_interview_reviewer_evaluation" ("round_id","reviewer_id");--> statement-breakpoint
ALTER TABLE "human_interview_reviewer_evaluation" ADD CONSTRAINT "human_interview_reviewer_evaluation_round_org_fk" FOREIGN KEY ("round_id","organization_id") REFERENCES "human_interview_round"("id","organization_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "human_interview_reviewer_evaluation" ADD CONSTRAINT "human_interview_reviewer_evaluation_reviewer_fk" FOREIGN KEY ("reviewer_id") REFERENCES "user"("id") ON DELETE SET NULL;
--> statement-breakpoint
-- Preserve historical human feedback without reopening rounds or touching sync jobs.
-- A null author is intentionally not guessed from meeting membership.
INSERT INTO human_interview_reviewer_evaluation
  (id, organization_id, round_id, reviewer_id, evaluation, outcome, submitted_at, updated_at, legacy)
SELECT 'legacy:' || r.id, r.organization_id, r.id, r.evaluation_updated_by,
  r.evaluation, CASE WHEN r.evaluation_status = 'submitted' THEN r.outcome ELSE NULL END,
  CASE WHEN r.evaluation_status = 'submitted' THEN COALESCE(r.evaluation_submitted_at, r.completed_at, r.updated_at) ELSE NULL END,
  COALESCE(r.evaluation_updated_at, r.updated_at), true
FROM human_interview_round r
WHERE r.evaluation IS NOT NULL
  AND (r.evaluation_updated_by IS NOT NULL OR r.evaluation_status = 'submitted'
    OR NOT EXISTS (
      SELECT 1 FROM human_interview_evaluation_snapshot s
      WHERE s.round_id = r.id AND s.source = 'ai_generated' AND s.evaluation = r.evaluation
    ));
