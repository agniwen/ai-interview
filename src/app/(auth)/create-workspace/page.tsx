import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server/auth-session";
import { CreateWorkspaceForm } from "./_components/create-form";

export const metadata: Metadata = {
  title: "创建工作区",
};

export default async function CreateWorkspacePage() {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="mb-6 text-2xl font-semibold">创建新工作区</h1>
      <CreateWorkspaceForm />
    </div>
  );
}
