import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
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
import { Icon } from "@/components/ui/icon";
import { useSidebar } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";

const WHITESPACE_REGEX = /\s+/;

const userTriggerClassName =
  "transition-[background-color,border-color,color,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:scale-100 active:bg-sidebar-accent active:text-sidebar-accent-foreground motion-reduce:transition-none";

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

interface SessionUser {
  email?: string | null;
  feishuTenantName?: string | null;
  image?: string | null;
  name?: string | null;
}

function UserMenuDropdown({
  collapsed,
  onSignOut,
  user,
}: {
  collapsed: boolean;
  onSignOut: () => void;
  user: SessionUser;
}) {
  const userName = user.name ?? "用户";
  const userEmail = user.email ?? "";
  const organizationName = user.feishuTenantName ?? null;
  const userInitials = getInitials(user.name, user.email);

  const trigger = collapsed ? (
    <Button
      aria-label="用户菜单"
      className={`w-full rounded-xl ${userTriggerClassName}`}
      size="icon"
      type="button"
      variant="ghost"
    >
      <Avatar size="sm">
        <AvatarImage alt={userName} src={user.image ?? undefined} />
        <AvatarFallback>{userInitials}</AvatarFallback>
      </Avatar>
    </Button>
  ) : (
    <Button
      className={`h-9 w-full justify-start gap-2 rounded-lg px-2 ${userTriggerClassName}`}
      type="button"
      variant="ghost"
    >
      <Avatar size="sm">
        <AvatarImage alt={userName} src={user.image ?? undefined} />
        <AvatarFallback>{userInitials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate font-medium text-sm leading-none">{userName}</p>
      </div>
    </Button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="end" className="w-56" side="top">
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
        <DropdownMenuItem onClick={onSignOut} variant="destructive">
          <Icon className="mr-2 size-4" icon="ph:sign-out" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Sidebar footer user chip + dropdown (aligned with web `SidebarUserSection`).
 * Desktop omits web-only links (工作台 / 管理后台) and app-update control.
 */
export function SidebarUserSection() {
  const navigate = useNavigate();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { data: session, isPending } = authClient.useSession();

  const handleSignOut = useCallback(async () => {
    await authClient.signOut();
    void navigate({ replace: true, to: "/login" });
  }, [navigate]);

  if (isPending) {
    return (
      <div className="border-sidebar-border border-t px-2 py-2 select-none">
        <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  return (
    <div className="border-sidebar-border border-t px-2 py-2 select-none">
      {collapsed ? (
        <div className="flex w-full flex-col items-center gap-2">
          <UserMenuDropdown
            collapsed
            onSignOut={() => {
              void handleSignOut();
            }}
            user={session.user}
          />
        </div>
      ) : (
        <div className="flex w-full items-center gap-2">
          <div className="min-w-0 flex-1">
            <UserMenuDropdown
              collapsed={false}
              onSignOut={() => {
                void handleSignOut();
              }}
              user={session.user}
            />
          </div>
        </div>
      )}
    </div>
  );
}
