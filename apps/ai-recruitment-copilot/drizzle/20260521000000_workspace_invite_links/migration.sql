-- =====================================================================
-- Workspace 邀请链接迁移：
--   1. 新增 workspace_invite_link 表（per-org，可禁用）
--   2. member 表新增 invite_link_id 列，记录该成员通过哪个邀请链接加入
--
-- Workspace invite links migration:
--   1. Add workspace_invite_link table (per-organization, disable-able)
--   2. Add invite_link_id column on member to record which link a member
--      joined through
-- =====================================================================

CREATE TABLE "workspace_invite_link" (
	"code" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"disabled_at" timestamp,
	"disabled_by" text,
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "workspace_invite_link_org_idx" ON "workspace_invite_link" ("organization_id","disabled_at");--> statement-breakpoint
ALTER TABLE "workspace_invite_link" ADD CONSTRAINT "workspace_invite_link_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workspace_invite_link" ADD CONSTRAINT "workspace_invite_link_disabled_by_user_id_fkey" FOREIGN KEY ("disabled_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "workspace_invite_link" ADD CONSTRAINT "workspace_invite_link_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint

ALTER TABLE "member" ADD COLUMN "invite_link_id" text;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_invite_link_id_workspace_invite_link_id_fkey" FOREIGN KEY ("invite_link_id") REFERENCES "workspace_invite_link"("id") ON DELETE SET NULL;
