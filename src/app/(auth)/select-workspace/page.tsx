import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentSession } from "@/lib/server/auth-session";
import { db } from "@/lib/server/db";
import { member, organization } from "@/lib/shared/db/schema";

export const metadata: Metadata = {
  title: "选择工作区",
};

export default async function SelectWorkspacePage() {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/login");
  }

  const rows = await db
    .select({ name: organization.name, slug: organization.slug })
    .from(organization)
    .innerJoin(member, eq(member.organizationId, organization.id))
    .where(eq(member.userId, session.user.id));

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
            <li key={r.slug}>
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
      <Button asChild>
        <Link href="/create-workspace">创建新工作区</Link>
      </Button>
    </div>
  );
}
