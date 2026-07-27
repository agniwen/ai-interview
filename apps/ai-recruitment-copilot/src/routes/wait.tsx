import { createFileRoute, redirect, useLoaderData, useNavigate } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/client/auth-client";
import { getNoAccessWaitState } from "@/lib/start/auth-session";
import { formatDocumentTitle } from "@/lib/start/document-title";

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

function WaitRoute() {
  const state = useLoaderData({ from: "/wait" });
  const navigate = useNavigate();

  if (state.status !== "waiting") {
    return null;
  }

  const userName = state.user.name?.trim() || state.user.email;
  const initials = getInitials(userName);

  async function signOut() {
    await authClient.signOut();
    await navigate({ to: "/login" });
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="text-muted-foreground text-sm">AI Recruitment Copilot</span>
        <ThemeToggle />
      </header>
      <main className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-md flex-col items-center justify-center gap-8 px-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="font-semibold text-2xl tracking-tight">等待管理员分配角色</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              你已加入「{state.workspace.name}」，当前账号还没有可访问的工作区权限。
              管理员分配其他角色后即可进入系统。
            </p>
          </div>
        </div>

        <div className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left">
          <Avatar className="size-10 shrink-0">
            <AvatarFallback className="bg-muted font-medium text-foreground text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-sm">{userName}</p>
            <p className="truncate text-muted-foreground text-xs">{state.user.email}</p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={() => void navigate({ to: "/" })}>
            刷新状态
          </Button>
          <Button className="flex-1" onClick={() => void signOut()} variant="outline">
            退出登录
          </Button>
        </div>
      </main>
    </div>
  );
}

export const Route = createFileRoute("/wait")({
  loader: async () => {
    const state = await getNoAccessWaitState();
    if (state.status === "unauthenticated") {
      throw redirect({ href: "/login" });
    }
    if (state.status === "not_waiting") {
      throw redirect({ href: "/" });
    }
    return state;
  },
  head: () => ({
    meta: [{ title: formatDocumentTitle("等待授权") }],
  }),
  component: WaitRoute,
});
