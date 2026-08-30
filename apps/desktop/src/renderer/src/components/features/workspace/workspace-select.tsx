import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import {
  desktopWorkspaceKeys,
  listWorkspaces,
  resolveActiveWorkspace,
  setActiveWorkspace,
} from "@/lib/client/workspace";
import type { WorkspaceOrg } from "@/lib/client/workspace";
import { useSuspendChromeDrag } from "@/lib/use-suspend-chrome-drag";
import { cn } from "@arc/shared/utils";

interface ElectronNoDragStyle extends CSSProperties {
  WebkitAppRegion: "no-drag";
  appRegion: "no-drag";
}

const noDragStyle: ElectronNoDragStyle = {
  WebkitAppRegion: "no-drag",
  appRegion: "no-drag",
};

/**
 * Compact workspace picker for the desktop chrome bar (left of settings).
 * Trigger width follows the active workspace name (not the longest option).
 * Switching updates session active org and the desktop-active-workspace query
 * so studio lists (e.g. 招聘台) refetch against the new slug.
 */
export function WorkspaceSelect(): React.JSX.Element | null {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // Title-bar drag regions swallow clicks; suspend while open so outside click closes.
  useSuspendChromeDrag(open);

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
      // Drop studio data scoped to the previous workspace.
      void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
    },
  });

  const orgs = orgsQuery.data ?? [];
  const active = activeQuery.data ?? null;
  const label = active?.name ?? "选择工作区";

  if (orgsQuery.isPending || activeQuery.isPending) {
    return <div aria-hidden className="h-6 w-20 shrink-0 rounded-[8px] bg-muted/40" />;
  }

  if (orgs.length === 0) {
    return null;
  }

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger
        aria-label="选择工作区"
        className={cn(
          "app-no-drag inline-flex h-6 max-w-[10rem] shrink-0 items-center gap-1 rounded-[8px] px-1.5 text-xs text-foreground transition-colors",
          "hover:bg-foreground/8 dark:hover:bg-foreground/12",
          "outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
        disabled={switchMutation.isPending}
        style={noDragStyle}
        type="button"
      >
        <span className="min-w-0 truncate">{label}</span>
        <Icon className="size-3 shrink-0" icon="ph:caret-down" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[250] min-w-[10rem]" sideOffset={6}>
        {orgs.map((org) => (
          <DropdownMenuItem
            className={cn(org.id === active?.id && "bg-accent")}
            disabled={switchMutation.isPending}
            key={org.id}
            onClick={() => {
              if (org.id === active?.id) {
                return;
              }
              switchMutation.mutate(org.id);
            }}
          >
            <span className="truncate">{org.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
