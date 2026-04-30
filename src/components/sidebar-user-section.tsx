"use client";

import type { ReactNode } from "react";
import { ChevronsUpDownIcon, HouseIcon, LogOutIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { FeishuSignInButton } from "@/components/auth/feishu-sign-in-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/auth-client";

const WHITESPACE_REGEX = /\s+/;

function getInitials(name?: string | null, email?: string | null) {
  const source = (name ?? email ?? "").trim();

  if (!source) {
    return "U";
  }

  const words = source.split(WHITESPACE_REGEX).filter(Boolean);

  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

// oxlint-disable-next-line complexity -- Shared user section branches on session state and collapse variants.
export function SidebarUserSection({
  collapsed,
  callbackURL = "/",
  showHomeLink = true,
}: {
  collapsed: boolean;
  callbackURL?: string;
  showHomeLink?: boolean;
}) {
  const router = useRouter();
  const isHydrated = useHydrated();
  const { data: session, isPending } = authClient.useSession();

  const handleSignOut = useCallback(async () => {
    await authClient.signOut();
    router.replace("/");
  }, [router]);

  const showLoading = !isHydrated || isPending;
  const userName = session?.user?.name ?? "用户";
  const userEmail = session?.user?.email ?? "";
  const organizationName = session?.user?.organizationName ?? null;
  const userInitials = getInitials(session?.user?.name, session?.user?.email);

  let content: ReactNode;

  if (showLoading) {
    content = collapsed ? (
      <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
    ) : (
      <div className="h-9 w-full animate-pulse rounded-full bg-muted" />
    );
  } else if (session?.user) {
    content = collapsed ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="用户菜单"
            className="w-full"
            size="icon"
            type="button"
            variant="ghost"
          >
            <Avatar size="sm">
              <AvatarImage alt={userName} src={session.user.image ?? undefined} />
              <AvatarFallback>{userInitials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="space-y-0.5">
            <p className="truncate font-medium text-sm">{userName}</p>
            <p className="truncate text-muted-foreground text-xs">{userEmail}</p>
            {organizationName ? (
              <p className="truncate text-muted-foreground text-xs">{organizationName}</p>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {showHomeLink ? (
            <DropdownMenuItem asChild>
              <Link href="/">
                <HouseIcon className="mr-2 size-4" />
                返回首页
              </Link>
            </DropdownMenuItem>
          ) : null}
          {showHomeLink ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem onClick={handleSignOut} variant="destructive">
            <LogOutIcon className="mr-2 size-4" />
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="w-full justify-start gap-2 p-1! rounded-full"
            type="button"
            variant="ghost"
          >
            <Avatar size="default">
              <AvatarImage alt={userName} src={session.user.image ?? undefined} />
              <AvatarFallback>{userInitials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate font-medium text-sm">{userName}</p>
              <p className="truncate text-muted-foreground text-xs">
                {organizationName ?? userEmail}
              </p>
            </div>
            <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="space-y-0.5">
            <p className="truncate font-medium text-sm">{userName}</p>
            <p className="truncate text-muted-foreground text-xs">{userEmail}</p>
            {organizationName ? (
              <p className="truncate text-muted-foreground text-xs">{organizationName}</p>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {showHomeLink ? (
            <DropdownMenuItem asChild>
              <Link href="/">
                <HouseIcon className="mr-2 size-4" />
                返回首页
              </Link>
            </DropdownMenuItem>
          ) : null}
          {showHomeLink ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem onClick={handleSignOut} variant="destructive">
            <LogOutIcon className="mr-2 size-4" />
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  } else {
    content = collapsed ? (
      <Button
        aria-label="登录"
        asChild
        className="w-full"
        size="icon"
        type="button"
        variant="ghost"
      >
        <Link href={`/login?callbackURL=${encodeURIComponent(callbackURL)}`}>
          <UserIcon className="size-4" />
        </Link>
      </Button>
    ) : (
      <div className="flex w-full flex-col gap-2">
        <FeishuSignInButton callbackURL={callbackURL} />
        <FeishuSignInButton
          variant="default"
          callbackURL={callbackURL}
          label="极光 HR 飞书登录"
          providerId="feishu-jiguang-hr"
        />
      </div>
    );
  }

  return (
    <div className="border-border/65 border-t px-2 py-2">
      {collapsed ? content : <div className="flex items-center gap-2">{content}</div>}
    </div>
  );
}
