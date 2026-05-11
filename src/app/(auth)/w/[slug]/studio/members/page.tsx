import type { Metadata } from "next";
import { MembersManagementPage } from "./_components/members-management-page";

export const metadata: Metadata = {
  title: "成员管理",
};

export default function MembersPage() {
  return <MembersManagementPage />;
}
