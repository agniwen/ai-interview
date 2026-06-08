import { createFileRoute } from "@tanstack/react-router";
import { MembersManagementPage } from "@/components/studio/members/members-management-page";

export const Route = createFileRoute("/w/$slug/studio/members")({
  component: MembersManagementPage,
  head: () => ({
    meta: [{ title: "工作区管理" }],
  }),
});
