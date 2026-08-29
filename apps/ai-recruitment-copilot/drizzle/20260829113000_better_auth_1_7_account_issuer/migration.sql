ALTER TABLE "account" ADD COLUMN "issuer" text;
--> statement-breakpoint
UPDATE "account"
SET "issuer" = CASE "provider_id"
  WHEN 'credential' THEN 'local:credential'
  WHEN 'google' THEN 'https://accounts.google.com'
  WHEN 'feishu' THEN 'local:oauth:feishu'
  WHEN 'feishu-jiguang-hr' THEN 'local:oauth:feishu-jiguang-hr'
END
WHERE "issuer" IS NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "account" WHERE "issuer" IS NULL) THEN
    RAISE EXCEPTION 'Better Auth 1.7 account migration found an unmapped provider_id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "account"
    GROUP BY "issuer", "account_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Better Auth 1.7 account migration found duplicate issuer/account_id identities';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_account_uq" ON "account" ("issuer", "account_id");
--> statement-breakpoint
DROP INDEX "account_provider_account_uq";
