import { useMemo } from "react";
import { useWatch } from "react-hook-form";

import { useAllConnections } from "../../tool-providers/hooks/use-all-connections";
import { useAllProviderTools } from "../../tool-providers/hooks/use-all-provider-tools";
import type { AgentBuilderEditFormValues } from "../schemas";
import { buildAvailableToolRecords } from "../services/build-available-tool-records";
import { buildAgentTools } from "../types/agent-tool";
import type { AgentTool } from "../types/agent-tool";
import { useBuilderPickerVisibility } from "./use-builder-settings";

interface UseAvailableAgentToolsArgs {
  toolsData: Record<string, unknown>;
  agentsData: Record<string, unknown>;
  workflowsData?: Record<string, unknown>;
  selectedTools: Record<string, boolean> | undefined;
  selectedAgents: Record<string, boolean> | undefined;
  selectedWorkflows?: Record<string, boolean> | undefined;
  excludeAgentId?: string;
}

const EMPTY_RECORD: Record<string, unknown> = {};

function filterByAllowlist<T>(data: Record<string, T>, allowed: Set<string>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(data)) {
    // Server normalizes picker IDs to the response keys of each list endpoint,
    // so a direct `Object.keys(data)` match is sufficient.
    if (allowed.has(key)) {
      out[key] = value;
    }
  }
  return out;
}

export function useAvailableAgentTools({
  toolsData,
  agentsData,
  workflowsData,
  selectedTools,
  selectedAgents,
  selectedWorkflows,
  excludeAgentId,
}: UseAvailableAgentToolsArgs): AgentTool[] {
  const resolvedWorkflowsData = workflowsData ?? EMPTY_RECORD;
  const picker = useBuilderPickerVisibility();

  // Fan out per (provider, toolkit) to the registered tool-provider catalog.
  // Server gates visibility via `allowedToolkits` / `allowedTools` on the
  // ToolProvider, so we intentionally bypass the builder picker allowlist
  // for integration rows (the picker has no `visibleIntegrations` field).
  const { tools: integrationTools } = useAllProviderTools();
  // `scopeToSelf: true` ensures admins viewing/editing another user's agent
  // only see their own connections in the Builder picker — never other
  // authors' rows.
  const { hasConnection, getConnections } = useAllConnections({ scopeToSelf: true });
  const toolProvidersFormValue = useWatch<AgentBuilderEditFormValues>({
    name: "toolProviders",
  }) as AgentBuilderEditFormValues["toolProviders"];

  return useMemo(() => {
    const filteredTools =
      picker.visibleTools === null ? toolsData : filterByAllowlist(toolsData, picker.visibleTools);
    const filteredAgents =
      picker.visibleAgents === null
        ? agentsData
        : filterByAllowlist(agentsData, picker.visibleAgents);
    const filteredWorkflows =
      picker.visibleWorkflows === null
        ? resolvedWorkflowsData
        : filterByAllowlist(resolvedWorkflowsData, picker.visibleWorkflows);

    const records = buildAvailableToolRecords(
      filteredTools,
      filteredAgents,
      filteredWorkflows,
      excludeAgentId,
    );
    const native = buildAgentTools({
      agents: records.agents,
      selected: { agents: selectedAgents, tools: selectedTools, workflows: selectedWorkflows },
      tools: records.tools,
      workflows: records.workflows,
    });

    // Append integration rows after native items so existing ordering for
    // tools/agents/workflows is unchanged.
    const integration: AgentTool[] = integrationTools.map((item) => ({
      connectionLabels: getConnections(item.providerId, item.toolkit)
        .filter((connection) => connection.status === "active")
        .map((connection) => connection.label || connection.connectionId),
      description: item.description,
      hasConnection: hasConnection(item.providerId, item.toolkit),
      // `id` namespaces by `providerId:toolSlug` so it can never collide with
      // a native tool id (server-side native tool ids never contain `:`).
      id: `${item.providerId}:${item.slug}`,
      isChecked: Boolean(toolProvidersFormValue?.[item.providerId]?.tools?.[item.slug]),
      name: item.slug,
      providerId: item.providerId,
      toolkit: item.toolkit,
      type: "integration",
    }));

    return [...native, ...integration];
  }, [
    toolsData,
    agentsData,
    resolvedWorkflowsData,
    selectedTools,
    selectedAgents,
    selectedWorkflows,
    excludeAgentId,
    picker,
    integrationTools,
    toolProvidersFormValue,
    hasConnection,
    getConnections,
  ]);
}
