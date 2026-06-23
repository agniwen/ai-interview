"use client";
import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/client/auth-client";
import {
  useOptionalWorkspaceId,
  useOptionalWorkspaceMemberRole,
} from "@/lib/client/workspace-context";
import type { AppRole, statement } from "@arc/shared/permissions";

const APP_ROLES = new Set<string>(["admin", "member", "owner"]);

type HasPermissionResult = boolean | { data?: boolean | { success?: boolean }; error?: unknown };

function readHasPermissionResult(result: HasPermissionResult): boolean {
  if (typeof result === "boolean") {
    return result;
  }
  if (typeof result.data === "boolean") {
    return result.data;
  }
  return Boolean(result.data?.success);
}

export function useHasPermission<R extends keyof typeof statement>(
  resource: R,
  action: (typeof statement)[R][number],
): boolean {
  const workspaceId = useOptionalWorkspaceId();
  const workspaceMemberRole = useOptionalWorkspaceMemberRole();
  const { data: org } = authClient.useActiveOrganization();
  const { data: session } = authClient.useSession();

  const memberRole =
    workspaceMemberRole ??
    org?.members?.find((member) => member.userId === session?.user?.id)?.role;
  const staticAllowed =
    Boolean(memberRole && APP_ROLES.has(memberRole)) &&
    authClient.organization.checkRolePermission({
      permissions: { [resource]: [action] } as Record<string, string[]>,
      role: memberRole as AppRole,
    });

  const { data } = useQuery({
    enabled: Boolean(memberRole && workspaceId),
    queryFn: async () => {
      const result = (await authClient.organization.hasPermission({
        permissions: { [resource]: [action] } as Record<string, string[]>,
      })) as HasPermissionResult;
      return readHasPermissionResult(result);
    },
    queryKey: ["workspace-permission", workspaceId, memberRole, resource, action],
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  if (!memberRole) {
    return false;
  }
  return data ?? staticAllowed;
}
