import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateWorkspaceDialog } from "@/components/workspace/create-workspace-dialog";
import { getCurrentOrganizations, getCurrentSession } from "@/lib/server/auth-session";

export const metadata: Metadata = {
  title: "选择工作区",
};

export default async function SelectWorkspacePage() {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/login");
  }

  const rows = await getCurrentOrganizations();

  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="mb-6 text-2xl font-semibold">选择一个工作区</h1>
      {rows.length === 0 ? (
        <p className="mb-4 text-muted-foreground">
          你还没有加入任何工作区。创建一个，或者等待管理员邀请。
        </p>
      ) : (
        <ul className="mb-6 space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/w/${r.slug}`}>
                <Card className="transition-colors hover:bg-accent">
                  <CardHeader>
                    <CardTitle>{r.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {`/w/${r.slug}`}
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <CreateWorkspaceDialog trigger={<Button>创建新工作区</Button>} />
    </div>
  );
}
