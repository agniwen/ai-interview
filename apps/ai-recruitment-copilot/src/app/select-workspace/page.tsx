import { ArrowRightIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
        {/* 标题区：用一个软背景的图标当 hero affordance,比纯文字更有上下文感。
            Hero affordance: a soft-background icon gives the page more weight
            than a bare heading and signals "you're picking a workspace". */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="space-y-1.5">
            <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">选择一个工作区</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {rows.length > 0
                ? "继续进入你已加入的工作区，或者创建新的工作区开始协作。"
                : "你还没有加入任何工作区，创建一个或等待管理员邀请。"}
            </p>
          </div>
        </div>

        {rows.length > 0 ? (
          /* 卡片列表：颜色 / 边框 / 阴影沿用项目 Card 组件那一套
              (rounded-xl + border-border + bg-background + shadow-xs)，
              不引入额外色彩。布局保留——hover 微微抬升 + 箭头滑出。
              Visual tokens mirror the project Card component (rounded-xl,
              border-border, bg-background, shadow-xs); no extra hues.
              Layout (hover lift + arrow slide) kept. */
          <ul className="space-y-2.5">
            {rows.map((r) => (
              <li key={r.id}>
                <Link className="block" href={`/w/${r.slug}`}>
                  <article className="group flex items-center gap-4 rounded-xl border border-border bg-background px-4 py-3.5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/10 hover:bg-card hover:shadow-sm">
                    <Avatar className="size-11 shrink-0">
                      <AvatarFallback className="bg-muted font-medium text-foreground text-sm">
                        {getInitials(r.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="truncate font-semibold text-foreground text-sm leading-tight">
                        {r.name}
                      </p>
                      <p className="truncate text-muted-foreground text-xs">{r.slug}</p>
                    </div>
                    <ArrowRightIcon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground transition-all duration-200 group-hover:translate-x-1 group-hover:text-foreground"
                    />
                  </article>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {/* 分隔横线：有工作区时把"创建"作为次级动作，无工作区时是主要动作。
            Separator turns 「创建新工作区」 into a secondary CTA when the user
            already has workspaces. */}
        {rows.length > 0 ? (
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
