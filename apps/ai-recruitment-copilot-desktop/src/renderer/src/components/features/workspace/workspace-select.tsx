import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  desktopWorkspaceKeys,
  listWorkspaces,
  resolveActiveWorkspace,
  setActiveWorkspace,
} from "@/lib/client/workspace";
import type { WorkspaceOrg } from "@/lib/client/workspace";
import { useSuspendChromeDrag } from "@/lib/use-suspend-chrome-drag";

/**
 * Compact workspace picker for the desktop chrome bar (left of settings).
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
  const activeId = activeQuery.data?.id ?? null;

  if (orgsQuery.isPending || activeQuery.isPending) {
    return <div aria-hidden className="h-7 w-[8.5rem] shrink-0 rounded-md bg-muted/40" />;
  }

  if (orgs.length === 0) {
    return null;
  }

  return (
    <Select
      disabled={switchMutation.isPending}
      onOpenChange={setOpen}
      onValueChange={(value) => {
        if (typeof value !== "string" || value === activeId) {
          return;
        }
        switchMutation.mutate(value);
      }}
      open={open}
      value={activeId ?? undefined}
    >
      <SelectTrigger
        aria-label="选择工作区"
        className="h-7 max-w-[10rem] min-w-[7rem] gap-1 border-0 bg-transparent px-2 shadow-none hover:bg-muted/50 dark:hover:bg-muted/40"
        size="sm"
      >
        <SelectValue placeholder="选择工作区" />
      </SelectTrigger>
      <SelectContent align="end" className="z-[250] min-w-[10rem]">
        {orgs.map((org) => (
          <SelectItem key={org.id} value={org.id}>
            {org.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
