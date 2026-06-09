import { ArrowRightIcon, PlusIcon } from "lucide-react";
import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CreateWorkspaceDialog } from "@/components/workspace/create-workspace-dialog";
import { getWorkspaceSelectionState } from "@/lib/start/auth-session";
import { UserMenu } from "@/components/select-workspace/user-menu";

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

function SelectWorkspaceRoute() {
  const state = useLoaderData({ from: "/select-workspace" });

  if (state.status !== "ready") {
    return null;
  }

  const { organizations, user } = state;
  const userName = user.name?.trim() || user.email;
  const userInitials = getInitials(user.name || user.email);

  return (
    <div className="relative min-h-dvh bg-gradient-to-b from-background via-background to-muted/30">
      <header className="flex items-center justify-between px-6 py-4">
        <span className=" text-muted-foreground text-sm">AI Recruitment Copilot</span>
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

      <main className="mx-auto flex w-full max-w-xl flex-col gap-10 px-6 py-12 sm:py-20">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="space-y-1.5">
            <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">选择一个工作区</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {organizations.length > 0
                ? "继续进入你已加入的工作区，或者创建新的工作区开始协作。"
                : "你还没有加入任何工作区，创建一个或等待管理员邀请。"}
            </p>
          </div>
        </div>

        {organizations.length > 0 ? (
          <ul className="space-y-2.5">
            {organizations.map((organization) => (
              <li key={organization.id}>
                <a className="block" href={`/w/${organization.slug}`}>
                  <article className="group flex items-center gap-4 rounded-xl border border-border bg-background px-4 py-3.5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/10 hover:bg-card hover:shadow-sm">
                    <Avatar className="size-11 shrink-0">
                      <AvatarFallback className="bg-muted font-medium text-foreground text-sm">
                        {getInitials(organization.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="truncate font-semibold text-foreground text-sm leading-tight">
                        {organization.name}
                      </p>
                      <p className="truncate text-muted-foreground text-xs">{organization.slug}</p>
                    </div>
                    <ArrowRightIcon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground transition-all duration-200 group-hover:translate-x-1 group-hover:text-foreground"
                    />
                  </article>
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        {organizations.length > 0 ? (
          <div className="relative">
            <div aria-hidden="true" className="absolute inset-0 flex items-center">
              <div className="w-full border-border border-t" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-3 text-muted-foreground/60 text-xs">或者</span>
            </div>
          </div>
        ) : null}

        <CreateWorkspaceDialog
          trigger={
            <Button
              className="w-full gap-2"
              size="lg"
              variant={organizations.length === 0 ? "default" : "outline"}
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

export const Route = createFileRoute("/select-workspace")({
  component: SelectWorkspaceRoute,
  head: () => ({
    meta: [{ title: "选择工作区" }],
  }),
  loader: async () => {
    const state = await getWorkspaceSelectionState();
    if (state.status === "unauthenticated") {
      throw redirect({ href: "/login" });
    }
    return state;
  },
});
