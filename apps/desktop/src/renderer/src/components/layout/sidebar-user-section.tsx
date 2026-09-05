import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import type { AppIconName } from "@/components/ui/icon";
import { authClient } from "@/lib/auth-client";
import {
  desktopWorkspaceKeys,
  listWorkspaces,
  resolveActiveWorkspace,
  setActiveWorkspace,
} from "@/lib/client/workspace";
import type { WorkspaceOrg } from "@/lib/client/workspace";
import type { ThemeMode } from "@/lib/settings";
import { cn } from "@app/shared/utils";
import { themeModeSchema } from "../../../../preload/orpc-contract";

const WHITESPACE_REGEX = /\s+/;

const THEME_OPTIONS = [
  { icon: "ph:sun", label: "浅色", value: "light" },
  { icon: "ph:moon", label: "深色", value: "dark" },
  { icon: "ph:monitor", label: "跟随系统", value: "system" },
] satisfies { icon: AppIconName; label: string; value: ThemeMode }[];

const sidebarFooterTriggerInteractionClassName =
  "border-transparent transition-[background-color,border-color,color,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-transparent hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:border-transparent active:scale-100 active:bg-sidebar-accent-active active:text-sidebar-accent-foreground dark:hover:bg-sidebar-accent dark:hover:text-sidebar-accent-foreground dark:active:bg-sidebar-accent-active motion-reduce:transition-none";

const userTriggerClassName = cn(
  "h-10 w-full justify-start gap-2 rounded-lg px-2",
  sidebarFooterTriggerInteractionClassName,
);

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
  id: string;
  email?: string | null;
  feishuTenantName?: string | null;
  image?: string | null;
  name?: string | null;
}

function SidebarSettingsButton() {
  return (
    <Button
      aria-label="设置"
      className={cn("shrink-0 rounded-lg", sidebarFooterTriggerInteractionClassName)}
      nativeButton={false}
      render={<Link to="/settings" />}
      size="icon-lg"
      title="设置"
      variant="ghost"
    >
      <Icon icon="ph:gear" />
    </Button>
  );
}

export function UserMenuDropdown({
  activeWorkspace,
  onSignOut,
  onSwitchWorkspace,
  onThemeChange,
  switchingWorkspace,
  theme,
  user,
  workspaces,
}: {
  activeWorkspace: WorkspaceOrg | null;
  onSignOut: () => void;
  onSwitchWorkspace: (workspaceId: string) => void;
  onThemeChange: (theme: ThemeMode) => void;
  switchingWorkspace: boolean;
  theme: ThemeMode;
  user: SessionUser;
  workspaces: WorkspaceOrg[];
}) {
  const userName = user.name ?? "用户";
  const userEmail = user.email ?? "";
  const organizationName = user.feishuTenantName ?? null;
  const userInitials = getInitials(user.name, user.email);

  // Single stable trigger layout. Sidebar uses offcanvas collapse (opacity/width
  // to 0) — remounting icon vs full-width buttons on state flip caused flicker.
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button className={userTriggerClassName} type="button" variant="ghost">
            <Avatar label={`${userName}的头像`} seed={`user:${userEmail || user.id}`} size="sm">
              <AvatarImage alt={userName} src={user.image ?? undefined} />
              <AvatarFallback>{userInitials}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1 gap-0.5 text-left">
              <p className="truncate font-medium text-sm leading-none">{userName}</p>
              <p className="truncate text-[10px] text-muted-foreground leading-none">
                {activeWorkspace?.name ?? "选择工作区"}
              </p>
            </div>
            <Icon className="size-3 shrink-0 text-muted-foreground" icon="ph:caret-up-down" />
          </Button>
        }
      />
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
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger openOnHover>切换工作区</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              <DropdownMenuGroup>
                {workspaces.length > 0 ? (
                  <DropdownMenuRadioGroup
                    onValueChange={(workspaceId) => {
                      if (workspaceId !== activeWorkspace?.id) {
                        onSwitchWorkspace(workspaceId);
                      }
                    }}
                    value={activeWorkspace?.id ?? ""}
                  >
                    {workspaces.map((workspace) => (
                      <DropdownMenuRadioItem
                        disabled={switchingWorkspace}
                        key={workspace.id}
                        value={workspace.id}
                      >
                        <span className="truncate">{workspace.name}</span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                ) : (
                  <DropdownMenuItem disabled>暂无可用工作区</DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger openOnHover>主题</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              <DropdownMenuRadioGroup
                onValueChange={(value) => {
                  const parsedTheme = themeModeSchema.safeParse(value);
                  if (parsedTheme.success) {
                    onThemeChange(parsedTheme.data);
                  }
                }}
                value={theme}
              >
                {THEME_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    <Icon className="size-4" icon={option.icon} />
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
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
  const queryClient = useQueryClient();
  const { setTheme, theme } = useTheme();
  const { data: session, isPending } = authClient.useSession();
  const activeTheme = themeModeSchema.safeParse(theme).data ?? "system";
  const orgsQuery = useQuery({
    queryFn: listWorkspaces,
    queryKey: desktopWorkspaceKeys.list,
    staleTime: 60_000,
  });
  const activeQuery = useQuery({
    queryFn: resolveActiveWorkspace,
    queryKey: desktopWorkspaceKeys.active,
    staleTime: 60_000,
  });
  const switchMutation = useMutation({
    mutationFn: setActiveWorkspace,
    onSuccess: (org: WorkspaceOrg) => {
      queryClient.setQueryData(desktopWorkspaceKeys.active, org);
      void queryClient.invalidateQueries({ queryKey: desktopWorkspaceKeys.list });
      void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
    },
  });

  const handleSignOut = useCallback(async () => {
    await authClient.signOut();
    void navigate({ replace: true, to: "/login" });
  }, [navigate]);

  if (isPending || orgsQuery.isPending || activeQuery.isPending) {
    return (
      <div className="border-sidebar-border border-t px-2 py-2 select-none">
        <div className="flex min-w-0 items-center gap-1">
          <div className="h-10 min-w-0 flex-1 animate-pulse rounded-md bg-muted" />
          <SidebarSettingsButton />
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  return (
    <div className="border-sidebar-border border-t px-2 py-2 select-none">
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1">
          <UserMenuDropdown
            activeWorkspace={activeQuery.data ?? null}
            onSignOut={() => {
              void handleSignOut();
            }}
            onSwitchWorkspace={(workspaceId) => switchMutation.mutate(workspaceId)}
            onThemeChange={setTheme}
            switchingWorkspace={switchMutation.isPending}
            theme={activeTheme}
            user={session.user}
            workspaces={orgsQuery.data ?? []}
          />
        </div>
        <SidebarSettingsButton />
      </div>
    </div>
  );
}
