"use client";

import { IconHome, IconLogout, IconShieldCheck, IconUser } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { FeishuSignInButton } from "@/components/features/auth/feishu-sign-in-button";
import { SidebarAppUpdateButton } from "@/components/features/app-version/sidebar-app-update-button";
import { useAppVersion } from "@/components/features/app-version/app-version-provider";
import { TimeDisplay } from "@/components/features/display/time-display";
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
import { BUILD_TIME } from "@/lib/client/build-info";

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

function SidebarUserMenuLinks({
  showHomeLink,
  showPlatformLink,
  onSignOut,
}: {
  showHomeLink: boolean;
  showPlatformLink: boolean;
  onSignOut: () => void;
}) {
  const hasNavigationLinks = showHomeLink || showPlatformLink;

  return (
    <>
      {showHomeLink ? (
        <DropdownMenuItem
          render={
            <Link to="/studio">
              <IconHome className="mr-2 size-4" />
              返回工作台
            </Link>
          }
        />
      ) : null}
      {showPlatformLink ? (
        <DropdownMenuItem
          render={
            <Link to="/platform">
              <IconShieldCheck className="mr-2 size-4" />
              进入管理后台
            </Link>
          }
        />
      ) : null}
      {hasNavigationLinks ? <DropdownMenuSeparator /> : null}
      <DropdownMenuItem onClick={onSignOut} variant="destructive">
        <IconLogout className="mr-2 size-4" />
        退出登录
      </DropdownMenuItem>
    </>
  );
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
  const appVersion = useAppVersion();
  const latestBuildTime = appVersion?.latestBuildTime ?? null;

  const handleSignOut = useCallback(async () => {
    await authClient.signOut();
    void navigate({ replace: true, to: "/" });
  }, [navigate]);

  const showLoading = !isHydrated || isPending;
  const userName = session?.user?.name ?? "用户";
  const userEmail = session?.user?.email ?? "";
  const organizationName = session?.user?.feishuTenantName ?? null;
  const userInitials = getInitials(session?.user?.name, session?.user?.email);
  const showPlatformLink = !showHomeLink && session?.user?.role === "admin";

  let content: ReactNode;

  if (showLoading) {
    content = collapsed ? (
      <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
    ) : (
      <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
    );
  } else if (session?.user) {
    content = collapsed ? (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="用户菜单"
              className="w-full rounded-xl transition-[background-color,border-color,color,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:scale-100 active:bg-sidebar-accent active:text-sidebar-accent-foreground motion-reduce:transition-none"
              size="icon"
              type="button"
              variant="ghost"
            >
              <Avatar
                label={`${userName}的头像`}
                seed={`user:${userEmail || session.user.id}`}
                size="sm"
              >
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
              <p className="flex items-center gap-1 text-muted-foreground text-xs">
                <span>更新于</span>
                <TimeDisplay as="span" value={BUILD_TIME} />
              </p>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <SidebarUserMenuLinks
            onSignOut={handleSignOut}
            showHomeLink={showHomeLink}
            showPlatformLink={showPlatformLink}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    ) : (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              className="h-9 w-full justify-start gap-2 rounded-lg px-2 transition-[background-color,border-color,color,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:scale-100 active:bg-sidebar-accent active:text-sidebar-accent-foreground motion-reduce:transition-none"
              type="button"
              variant="ghost"
            >
              <Avatar
                label={`${userName}的头像`}
                seed={`user:${userEmail || session.user.id}`}
                size="sm"
              >
                <AvatarImage alt={userName} src={session.user.image ?? undefined} />
                <AvatarFallback>{userInitials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate font-medium text-sm leading-none">{userName}</p>
              </div>
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
              <p className="flex items-center gap-1 text-muted-foreground text-xs">
                <span>更新于</span>
                <TimeDisplay as="span" value={BUILD_TIME} />
              </p>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <SidebarUserMenuLinks
            onSignOut={handleSignOut}
            showHomeLink={showHomeLink}
            showPlatformLink={showPlatformLink}
          />
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

  const updateButton =
    latestBuildTime && session?.user ? (
      <SidebarAppUpdateButton latestBuildTime={latestBuildTime} />
    ) : null;

  return (
    <div className="border-border border-t px-2 pt-4 pb-2 select-none">
      {collapsed ? (
        <div className="flex w-full flex-col items-center gap-2">
          {content}
          {updateButton}
        </div>
      ) : (
        <div className="flex w-full items-center gap-2">
          <div className="min-w-0 flex-1">{content}</div>
          {updateButton}
        </div>
      )}
    </div>
  );
}
