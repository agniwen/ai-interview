import type { Metadata } from "next";
import { MembersManagementPage } from "./_components/members-management-page";

export const metadata: Metadata = {
  title: "工作区管理",
};

export default function MembersPage() {
  return <MembersManagementPage />;
}
