CREATE TABLE "external_application_link" (
	"organization_id" text PRIMARY KEY,
	"token" text NOT NULL UNIQUE,
	"enabled" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_application_link" ADD CONSTRAINT "external_application_link_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;