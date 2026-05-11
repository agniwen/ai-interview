import type { Metadata } from "next";
import { InviteDialog } from "./_components/invite-dialog";
import { MembersTable } from "./_components/members-table";

export const metadata: Metadata = {
  title: "成员管理",
};

export default function MembersPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">成员管理</h1>
        <InviteDialog />
      </div>
      <MembersTable />
    </div>
  );
}
