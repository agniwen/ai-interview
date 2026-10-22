CREATE TABLE "workspace_member_dotted_manager" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"manager_user_id" text,
	"organization_id" text,
	"user_id" text,
	CONSTRAINT "workspace_member_dotted_manager_pkey" PRIMARY KEY("organization_id","user_id","manager_user_id"),
	CONSTRAINT "workspace_member_dotted_manager_not_self_check" CHECK ("user_id" <> "manager_user_id")
);
--> statement-breakpoint
CREATE INDEX "workspace_member_dotted_manager_org_manager_idx" ON "workspace_member_dotted_manager" ("organization_id","manager_user_id");--> statement-breakpoint
ALTER TABLE "workspace_member_dotted_manager" ADD CONSTRAINT "workspace_member_dotted_manager_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workspace_member_dotted_manager" ADD CONSTRAINT "workspace_member_dotted_manager_member_fk" FOREIGN KEY ("user_id","organization_id") REFERENCES "member"("user_id","organization_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workspace_member_dotted_manager" ADD CONSTRAINT "workspace_member_dotted_manager_manager_fk" FOREIGN KEY ("manager_user_id","organization_id") REFERENCES "member"("user_id","organization_id") ON DELETE CASCADE;