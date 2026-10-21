"use client";

import {
  IconHome,
  IconLogout,
  IconPlugConnected,
  IconShieldCheck,
  IconUser,
} from "@tabler/icons-react";
import type { ReactNode } from "react";

import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { FeishuSignInButtons } from "@/components/features/auth/feishu-sign-in-buttons";
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
import { SidebarMenuButton } from "@/components/ui/sidebar";
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
      <DropdownMenuItem
        render={
          <Link to="/mcp">
            <IconPlugConnected className="mr-2 size-4" />
            MCP 接入
          </Link>
        }
      />
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
      <div className="h-9 w-full animate-pulse rounded-xl bg-muted" />
    ) : (
      <div className="h-9 w-full animate-pulse rounded-xl bg-muted" />
    );
  } else if (session?.user) {
    // 复用 SidebarMenuButton，跟随侧栏 data-collapsible 的宽度过渡与文字淡出；收起时保持 p-1 让头像位置不变。
    content = (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              className="h-9 rounded-[14px] p-1 transition-[width,height,padding,background-color,color] group-data-[collapsible=icon]:p-1!"
              type="button"
            >
              <Avatar
                label={`${userName}的头像`}
                seed={`user:${userEmail || session.user.id}`}
                size="sm"
              >
                <AvatarImage alt={userName} src={session.user.image ?? undefined} />
                <AvatarFallback>{userInitials}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 font-medium text-sm leading-none">{userName}</span>
            </SidebarMenuButton>
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
        <FeishuSignInButtons callbackURL={callbackURL} />
      </div>
    );
  }

  const updateButton =
    latestBuildTime && session?.user ? (
      <SidebarAppUpdateButton latestBuildTime={latestBuildTime} />
    ) : null;

  return (
    <div className="px-2 pt-1 pb-1 select-none">
      {/* 用 CSS 跟随 data-collapsible 切换排列，保持 DOM 结构不变，避免收起时按钮重新挂载导致头像跳动。 */}
      <div className="flex w-full items-center gap-2 group-data-[collapsible=icon]:flex-col">
        <div className="min-w-0 flex-1 group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:flex-none">
          {content}
        </div>
        {updateButton}
      </div>
    </div>
  );
}
