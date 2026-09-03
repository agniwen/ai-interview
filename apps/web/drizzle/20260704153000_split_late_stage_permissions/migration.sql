UPDATE "organization_role"
SET "permission" = (
  SELECT jsonb_object_agg("key", "value")
  FROM (
    SELECT
      "key",
      CASE
        WHEN "key" IN ('humanInterview', 'offer')
          AND jsonb_typeof("value") = 'array'
          AND "value" ? 'manage'
        THEN (
          SELECT jsonb_agg(
            "action"
            ORDER BY
              CASE "action"
                WHEN 'create' THEN 1
                WHEN 'read' THEN 2
                WHEN 'update' THEN 3
                WHEN 'delete' THEN 4
                ELSE 99
              END,
              "action"
          )
          FROM (
            SELECT DISTINCT "action"
            FROM (
              SELECT jsonb_array_elements_text("value") AS "action"
              UNION ALL
              SELECT unnest(ARRAY['create', 'read', 'update', 'delete']) AS "action"
            ) AS "raw_actions"
            WHERE "action" <> 'manage'
          ) AS "normalized_actions"
        )
        ELSE "value"
      END AS "value"
    FROM jsonb_each("organization_role"."permission"::jsonb)
  ) AS "normalized_permission"
)::text
WHERE (
  "permission"::jsonb ? 'humanInterview'
  AND "permission"::jsonb->'humanInterview' ? 'manage'
)
OR (
  "permission"::jsonb ? 'offer'
  AND "permission"::jsonb->'offer' ? 'manage'
);
