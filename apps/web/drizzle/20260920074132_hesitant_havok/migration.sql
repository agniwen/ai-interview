UPDATE "offer_approval_template"
SET "is_default" = false, "updated_at" = now()
WHERE "is_default" = true AND "enabled" = false;
--> statement-breakpoint
WITH ranked_enabled AS (
	SELECT
		"id",
		"organization_id",
		row_number() OVER (
			PARTITION BY "organization_id"
			ORDER BY "updated_at" DESC, "id"
		) AS "position"
	FROM "offer_approval_template"
	WHERE "enabled" = true
)
UPDATE "offer_approval_template" AS template
SET "is_default" = true, "updated_at" = now()
FROM ranked_enabled
WHERE template."id" = ranked_enabled."id"
	AND ranked_enabled."position" = 1
	AND NOT EXISTS (
		SELECT 1
		FROM "offer_approval_template" AS current_default
		WHERE current_default."organization_id" = template."organization_id"
			AND current_default."enabled" = true
			AND current_default."is_default" = true
	);
--> statement-breakpoint
ALTER TABLE "offer_approval_template" ADD CONSTRAINT "offer_approval_template_default_enabled_ck" CHECK (not "is_default" or "enabled");
