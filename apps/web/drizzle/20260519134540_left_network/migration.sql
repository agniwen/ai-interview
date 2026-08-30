CREATE TABLE "studio_interview_skill" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"interview_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"skill" text NOT NULL,
	CONSTRAINT "studio_interview_skill_pkey" PRIMARY KEY("interview_id","skill")
);
--> statement-breakpoint
CREATE INDEX "studio_interview_skill_org_skill_idx" ON "studio_interview_skill" ("organization_id","skill");--> statement-breakpoint
CREATE INDEX "studio_interview_skill_skill_idx" ON "studio_interview_skill" ("skill");--> statement-breakpoint
ALTER TABLE "studio_interview_skill" ADD CONSTRAINT "studio_interview_skill_interview_id_studio_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "studio_interview"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "studio_interview_skill" ADD CONSTRAINT "studio_interview_skill_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
-- 从既有 resume_profile JSONB 反填技能索引行。
-- Backfill the skill index rows from existing resume_profile JSONB arrays.
INSERT INTO "studio_interview_skill" ("interview_id", "organization_id", "skill")
SELECT
  si.id,
  si.organization_id,
  btrim(skill_value)
FROM "studio_interview" si,
     LATERAL jsonb_array_elements_text(si.resume_profile->'skills') AS skill_value
WHERE si.resume_profile IS NOT NULL
  AND jsonb_typeof(si.resume_profile->'skills') = 'array'
  AND btrim(skill_value) <> ''
ON CONFLICT ("interview_id", "skill") DO NOTHING;