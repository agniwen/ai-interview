"use client";

import { IconHome, IconLogout, IconUser } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { FeishuSignInButton } from "@/components/features/auth/feishu-sign-in-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/client/auth-client";

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
  const navigate = useNavigate();
  const isHydrated = useHydrated();
  const { data: session, isPending } = authClient.useSession();

  const handleSignOut = useCallback(async () => {
    await authClient.signOut();
    void navigate({ replace: true, to: "/" });
  }, [navigate]);

  const showLoading = !isHydrated || isPending;
  const userName = session?.user?.name ?? "用户";
  const userEmail = session?.user?.email ?? "";
  const organizationName = session?.user?.feishuTenantName ?? null;
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
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="用户菜单"
              className="w-full active:scale-100"
              size="icon"
              type="button"
              variant="ghost"
            >
              <Avatar size="sm">
                <AvatarImage alt={userName} src={session.user.image ?? undefined} />
                <AvatarFallback>{userInitials}</AvatarFallback>
              </Avatar>
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="space-y-0.5">
              <p className="truncate font-medium text-sm">{userName}</p>
              <p className="truncate text-muted-foreground text-xs">{userEmail}</p>
              {organizationName ? (
                <p className="truncate text-muted-foreground text-xs">{organizationName}</p>
              ) : null}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {showHomeLink ? (
            <DropdownMenuItem
              render={
                <Link to="/">
                  <IconHome className="mr-2 size-4" />
                  返回首页
                </Link>
              }
            />
          ) : null}
          {showHomeLink ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem onClick={handleSignOut} variant="destructive">
            <IconLogout className="mr-2 size-4" />
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              className="h-12 w-full justify-start gap-2 rounded-full hover:bg-background active:scale-100"
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
              {/* <SelectChevronsUpDownIcon className="size-4 text-muted-foreground" /> */}
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="space-y-0.5">
              <p className="truncate font-medium text-sm">{userName}</p>
              <p className="truncate text-muted-foreground text-xs">{userEmail}</p>
              {organizationName ? (
                <p className="truncate text-muted-foreground text-xs">{organizationName}</p>
              ) : null}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {showHomeLink ? (
            <DropdownMenuItem
              render={
                <Link to="/">
                  <IconHome className="mr-2 size-4" />
                  返回首页
                </Link>
              }
            />
          ) : null}
          {showHomeLink ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem onClick={handleSignOut} variant="destructive">
            <IconLogout className="mr-2 size-4" />
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  } else {
    content = collapsed ? (
      <Button
        aria-label="登录"
        className="w-full"
        nativeButton={false}
        render={
          <Link search={{ callbackURL }} to="/login">
            <IconUser className="size-4" />
          </Link>
        }
        size="icon"
        variant="ghost"
      />
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
    <div className="border-border border-t px-2 py-2 select-none">
      {collapsed ? content : <div className="flex items-center gap-2">{content}</div>}
    </div>
  );
}
