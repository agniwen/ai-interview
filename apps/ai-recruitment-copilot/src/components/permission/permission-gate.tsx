"use client";
import type { statement } from "@arc/shared/permissions";
import { useHasPermission } from "@/hooks/use-has-permission";

interface PermissionGateProps<R extends keyof typeof statement> {
  resource: R;
  action: (typeof statement)[R][number];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * 按当前用户在活跃 workspace 中的角色 gate 子节点的可见性。
 * 权限未通过时渲染 fallback (默认 null)。
 */
export function PermissionGate<R extends keyof typeof statement>({
  resource,
  action,
  fallback = null,
  children,
}: PermissionGateProps<R>) {
  const allowed = useHasPermission(resource, action);
  return allowed ? <>{children}</> : <>{fallback}</>;
}
