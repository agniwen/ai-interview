import { ChevronRightIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CreateWorkspaceDialog } from "@/components/workspace/create-workspace-dialog";
import { getCurrentOrganizations, getCurrentSession } from "@/lib/server/auth-session";
import { UserMenu } from "./_components/user-menu";

export const metadata: Metadata = {
  title: "选择工作区",
};

const WHITESPACE_REGEX = /\s+/;

function getInitials(source: string): string {
  const value = source.trim();
  if (!value) {
    return "U";
  }
  const words = value.split(WHITESPACE_REGEX).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
  }
  return value.slice(0, 2).toUpperCase();
}

export default async function SelectWorkspacePage() {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/login");
  }

  const rows = await getCurrentOrganizations();
  const { user } = session;
  const userName = user.name?.trim() || user.email;
  const userInitials = getInitials(user.name || user.email);

  return (
    <div className="relative min-h-dvh bg-gradient-to-b from-background via-background to-muted/30">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="font-semibold text-muted-foreground text-sm">AI Recruitment Copilot</span>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <UserMenu
            avatarUrl={user.image ?? null}
            email={user.email}
            initials={userInitials}
            name={userName}
          />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-col gap-8 px-6 py-12 sm:py-16">
        <div className="space-y-2 text-center">
          <h1 className="font-semibold text-3xl tracking-tight">选择一个工作区</h1>
          <p className="text-muted-foreground text-sm">
            {rows.length > 0
              ? "选择你已加入的工作区,或者创建一个新的开始协作。"
              : "你还没有加入任何工作区,创建一个或等待管理员邀请。"}
          </p>
        </div>

        {rows.length > 0 ? (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id}>
                <Link className="block" href={`/w/${r.slug}`}>
                  <Card className="group flex items-center gap-4 p-4 transition-all hover:border-foreground/20 hover:shadow-sm">
                    <Avatar className="size-10">
                      <AvatarFallback className="bg-primary/10 font-medium text-primary text-sm">
                        {getInitials(r.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="truncate font-mono text-muted-foreground text-xs">
                        /w/{r.slug}
                      </p>
                    </div>
                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        <CreateWorkspaceDialog
          trigger={
            <Button
              className="w-full gap-2"
              size="lg"
              variant={rows.length === 0 ? "default" : "outline"}
            >
              <PlusIcon className="size-4" />
              创建新工作区
            </Button>
          }
        />
      </main>
    </div>
  );
}
