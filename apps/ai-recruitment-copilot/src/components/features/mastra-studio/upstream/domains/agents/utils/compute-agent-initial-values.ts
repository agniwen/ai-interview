import type { GetAgentResponse, StoredAgentResponse } from "@mastra/client-js";
import { parse as superjsonParse } from "superjson";

import type {
  AgentFormValues,
  EntityConfig,
} from "../components/agent-edit-page/utils/form-validation";

import {
  normalizeToolsToRecord,
  normalizeIntegrationToolsToRecord,
  normalizeScorersFromApi,
  normalizeSkillsFromApi,
  normalizeWorkspaceFromApi,
  mapInstructionBlocksFromApi,
  parseObservationalMemoryFromApi,
} from "./agent-form-mappers";

/**
 * Map a `GetAgentResponse` (from `GET /agents/:id`) into an `AgentDataSource`
 * that the CMS edit form can consume. This allows code-defined agents to be
 * loaded into the edit form for creating stored config overrides.
 */
export function mapAgentResponseToDataSource(agent: GetAgentResponse): AgentDataSource {
  // Parse requestContextSchema from stringified JSON to an object.
  // Code agents serialize with superjson.stringify(), so we use superjsonParse
  // to unwrap the {json: {...}} envelope. Stored agents provide a plain object.
  let requestContextSchema: unknown;
  if (agent.requestContextSchema) {
    try {
      requestContextSchema =
        typeof agent.requestContextSchema === "string"
          ? superjsonParse(agent.requestContextSchema)
          : agent.requestContextSchema;
    } catch {
      // Invalid JSON — skip
    }
  }

  return {
    agents: agent.agents,
    description: agent.description,
    instructions: agent.instructions,
    model: { name: agent.modelId, provider: agent.provider },
    name: agent.name,
    requestContextSchema,
    // agent.skills is SkillMetadata[] (workspace-discovered skills for the agent),
    // not the stored-skill-config shape the edit form consumes. Code-defined agents
    // have no stored skill overrides, so leave this unset.
    skills: undefined,
    tools: agent.tools,
    workflows: agent.workflows,
    workspace: agent.workspaceId
      ? ({ workspaceId: agent.workspaceId } as AgentDataSource["workspace"])
      : undefined,
  };
}

export interface AgentDataSource {
  name?: string;
  description?: string;
  instructions?: unknown;
  model?: unknown;
  tools?: unknown;
  integrationTools?: unknown;
  workflows?: unknown;
  agents?: unknown;
  scorers?: unknown;
  memory?: unknown;
  mcpClients?: unknown;
  skills?: StoredAgentResponse["skills"];
  workspace?: StoredAgentResponse["workspace"];
  requestContextSchema?: unknown;
}

export function computeAgentInitialValues(dataSource: AgentDataSource): Partial<AgentFormValues> {
  const toolsRecord = normalizeToolsToRecord(
    dataSource.tools as Parameters<typeof normalizeToolsToRecord>[0],
  );

  const memoryData = dataSource.memory as
    | {
        vector?: string;
        embedder?: string;
        options?: { lastMessages?: number | false; semanticRecall?: boolean; readOnly?: boolean };
        observationalMemory?:
          | boolean
          | {
              model?: string;
              scope?: "resource" | "thread";
              shareTokenBudget?: boolean;
              observation?: {
                model?: string;
                messageTokens?: number;
                maxTokensPerBatch?: number;
                bufferTokens?: number | false;
                bufferActivation?: number;
                blockAfter?: number;
              };
              reflection?: {
                model?: string;
                observationTokens?: number;
                blockAfter?: number;
                bufferActivation?: number;
              };
            };
      }
    | undefined;

  const { instructionsString, instructionBlocks } = mapInstructionBlocksFromApi(
    dataSource.instructions as Parameters<typeof mapInstructionBlocksFromApi>[0],
  );

  return {
    agents: normalizeToolsToRecord(
      dataSource.agents as Parameters<typeof normalizeToolsToRecord>[0],
    ),
    description: dataSource.description || "",
    instructionBlocks,
    instructions: instructionsString,
    integrationTools: normalizeIntegrationToolsToRecord(
      dataSource.integrationTools as
        | Record<string, { tools?: Record<string, EntityConfig> }>
        | undefined,
    ),
    memory: memoryData?.options
      ? {
          embedder: memoryData.embedder,
          enabled: true,
          lastMessages: memoryData.options.lastMessages,
          observationalMemory: parseObservationalMemoryFromApi(memoryData.observationalMemory),
          readOnly: memoryData.options.readOnly,
          semanticRecall: memoryData.options.semanticRecall,
          vector: memoryData.vector,
        }
      : undefined,
    model: {
      name: (dataSource.model as { provider?: string; name?: string })?.name || "",
      provider: (dataSource.model as { provider?: string; name?: string })?.provider || "",
    },
    name: dataSource.name || "",
    scorers: normalizeScorersFromApi(
      dataSource.scorers as Parameters<typeof normalizeScorersFromApi>[0],
    ),
    skills: normalizeSkillsFromApi(dataSource.skills),
    tools: toolsRecord,
    variables: dataSource.requestContextSchema as AgentFormValues["variables"],
    workflows: normalizeToolsToRecord(
      dataSource.workflows as Parameters<typeof normalizeToolsToRecord>[0],
    ),
    workspace: normalizeWorkspaceFromApi(dataSource.workspace),
  };
}
