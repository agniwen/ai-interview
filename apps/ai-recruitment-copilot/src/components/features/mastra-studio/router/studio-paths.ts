import { v4 as uuid } from "@lukeed/uuid";
import type { LinkComponentProviderProps } from "@/components/features/mastra-studio/upstream/lib/framework";

export const studioPaths: LinkComponentProviderProps["paths"] = {
  agentLink: (agentId) => `/agents/${agentId}/chat/new`,
  agentNewThreadLink: (agentId) => `/agents/${agentId}/chat/new`,
  agentSkillLink: (agentId, skillName, skillPath, workspaceId) =>
    workspaceId
      ? `/workspaces/${workspaceId}/skills/${encodeURIComponent(skillName)}?agentId=${encodeURIComponent(agentId)}${skillPath ? `&path=${encodeURIComponent(skillPath)}` : ""}`
      : "/workspaces",
  agentThreadLink: (agentId, threadId, messageId) =>
    messageId
      ? `/agents/${agentId}/chat/${threadId}?messageId=${messageId}`
      : `/agents/${agentId}/chat/${threadId}`,
  agentToolLink: (agentId, toolId) => `/agents/${agentId}/tools/${toolId}`,
  agentsLink: () => "/agents",
  cmsAgentCreateLink: () => "/cms/agents/create",
  cmsAgentEditLink: (agentId) => `/cms/agents/${agentId}/edit`,
  cmsPromptBlockCreateLink: () => "/cms/prompts/create",
  cmsPromptBlockEditLink: (promptBlockId) => `/cms/prompts/${promptBlockId}/edit`,
  cmsScorerEditLink: (scorerId) => `/cms/scorers/${scorerId}/edit`,
  cmsScorersCreateLink: () => "/cms/scorers/create",
  datasetExperimentLink: (datasetId, experimentId) =>
    `/datasets/${datasetId}/experiments/${experimentId}`,
  datasetItemLink: (datasetId, itemId) => `/datasets/${datasetId}/items/${itemId}`,
  datasetLink: (datasetId) => `/datasets/${datasetId}`,
  experimentLink: (experimentId) => `/experiments/${experimentId}`,
  mcpServerLink: (serverId) => `/mcps/${serverId}`,
  mcpServerToolLink: (serverId, toolId) => `/mcps/${serverId}/tools/${toolId}`,
  networkLink: (networkId) => `/networks/v-next/${networkId}/chat`,
  networkNewThreadLink: (networkId) => `/networks/v-next/${networkId}/chat/${uuid()}`,
  networkThreadLink: (networkId, threadId) => `/networks/v-next/${networkId}/chat/${threadId}`,
  processorLink: (processorId) => `/processors/${processorId}`,
  processorsLink: () => "/processors",
  promptBlockLink: (promptBlockId) => `/prompts/${promptBlockId}`,
  promptBlocksLink: () => "/prompts",
  scheduleLink: (scheduleId) => `/workflows/schedules/${encodeURIComponent(scheduleId)}`,
  schedulesLink: () => "/workflows/schedules",
  scorerLink: (scorerId) => `/scorers/${scorerId}`,
  skillLink: (skillName, skillPath, workspaceId) =>
    workspaceId
      ? `/workspaces/${workspaceId}/skills/${encodeURIComponent(skillName)}${skillPath ? `?path=${encodeURIComponent(skillPath)}` : ""}`
      : "/workspaces",
  toolLink: (toolId) => `/tools/${toolId}`,
  workflowLink: (workflowId) => `/workflows/${workflowId}`,
  workflowRunLink: (workflowId, runId) => `/workflows/${workflowId}/graph/${runId}`,
  workflowsLink: () => "/workflows",
  workspaceLink: (workspaceId) => (workspaceId ? `/workspaces/${workspaceId}` : "/workspaces"),
  workspaceSkillLink: (skillName, skillPath, workspaceId) =>
    workspaceId
      ? `/workspaces/${workspaceId}/skills/${encodeURIComponent(skillName)}${skillPath ? `?path=${encodeURIComponent(skillPath)}` : ""}`
      : "/workspaces",
  workspacesLink: () => "/workspaces",
};
