import { useBuilderSettings } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-builder-settings";
import { usePermissions } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/use-permissions";

export type DenialReason = "permission-denied" | "not-configured" | "error" | null;

export interface AgentFeatureFlags {
  tools?: boolean;
  agents?: boolean;
  workflows?: boolean;
  scorers?: boolean;
  skills?: boolean;
  memory?: boolean;
  variables?: boolean;
}

export interface UseBuilderAgentAccessResult {
  isLoading: boolean;
  error: Error | null;
  denialReason: DenialReason;
  isBuilderEnabled: boolean;
  hasAgentFeature: boolean;
  hasRequiredPermissions: boolean;
  canAccessAgentBuilder: boolean;
  canWrite: boolean;
  canExecute: boolean;
  canManageSkills: boolean;
  canUseFavorites: boolean;
  agentFeatures: AgentFeatureFlags | undefined;
}

function resolveDenialReason({
  error,
  hasAgentFeature,
  hasRequiredPermissions,
  isBuilderEnabled,
}: {
  error: unknown;
  hasAgentFeature: boolean;
  hasRequiredPermissions: boolean;
  isBuilderEnabled: boolean;
}): DenialReason {
  if (!hasRequiredPermissions) {
    return "permission-denied";
  }
  if (error) {
    return "error";
  }
  if (!isBuilderEnabled || !hasAgentFeature) {
    return "not-configured";
  }
  return null;
}

export function useBuilderAgentAccess(): UseBuilderAgentAccessResult {
  const { hasAnyPermission, hasPermission, rbacEnabled } = usePermissions();

  // Access requires read OR write (operators can browse but not create)
  const hasRequiredPermissions =
    !rbacEnabled || hasAnyPermission(["stored-agents:read", "stored-agents:write"]);
  const canFetchSettings =
    !rbacEnabled || hasAnyPermission(["stored-agents:read", "stored-agents:write"]);

  // Granular capability flags
  const canWrite = !rbacEnabled || hasPermission("stored-agents:write");
  const canExecute =
    !rbacEnabled || hasAnyPermission(["stored-agents:read", "stored-agents:write"]);
  const canManageSkills = !rbacEnabled || hasPermission("stored-skills:read");
  const canUseFavorites =
    !rbacEnabled || hasAnyPermission(["stored-agents:read", "stored-skills:read"]);

  const {
    data: builderSettings,
    isLoading,
    error,
  } = useBuilderSettings({
    enabled: canFetchSettings,
  });

  const isBuilderEnabled = builderSettings?.enabled === true;
  const hasAgentFeature = builderSettings?.features?.agent !== undefined;
  const canAccessAgentBuilder = hasRequiredPermissions && isBuilderEnabled && hasAgentFeature;

  const denialReason = resolveDenialReason({
    error,
    hasAgentFeature,
    hasRequiredPermissions,
    isBuilderEnabled,
  });

  return {
    agentFeatures: builderSettings?.features?.agent as AgentFeatureFlags | undefined,
    canAccessAgentBuilder,
    canExecute,
    canManageSkills,
    canUseFavorites,
    canWrite,
    denialReason,
    error: canFetchSettings ? (error as Error | null) : null,
    hasAgentFeature,
    hasRequiredPermissions,
    isBuilderEnabled,
    isLoading: canFetchSettings && isLoading,
  };
}
