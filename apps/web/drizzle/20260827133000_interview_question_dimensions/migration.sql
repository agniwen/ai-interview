-- Candidate-specific recommended questions predate the dimension field.
-- Backfill only missing/null dimensions; existing explicit classifications are preserved.
UPDATE "studio_interview" AS "candidate"
SET "interview_questions" = (
  SELECT jsonb_agg(
    CASE
      WHEN jsonb_typeof("entry"."question") = 'object'
        AND (
          NOT "entry"."question" ? 'dimension'
          OR "entry"."question"->'dimension' = 'null'::jsonb
        )
      THEN "entry"."question" || '{"dimension":"business"}'::jsonb
      ELSE "entry"."question"
    END
    ORDER BY "entry"."position"
  )
  FROM jsonb_array_elements("candidate"."interview_questions")
    WITH ORDINALITY AS "entry"("question", "position")
)
WHERE jsonb_typeof("candidate"."interview_questions") = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements("candidate"."interview_questions") AS "entry"("question")
    WHERE jsonb_typeof("entry"."question") = 'object'
      AND (
        NOT "entry"."question" ? 'dimension'
        OR "entry"."question"->'dimension' = 'null'::jsonb
      )
  );
