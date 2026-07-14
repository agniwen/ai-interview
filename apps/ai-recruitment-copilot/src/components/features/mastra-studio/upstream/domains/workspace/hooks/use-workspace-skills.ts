import { useMastraClient } from "@mastra/react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { isWorkspaceV1Supported, shouldRetryWorkspaceQuery } from "../compatibility";
import type {
  Skill,
  ListSkillsResponse,
  SearchSkillsResponse,
  ListReferencesResponse,
  GetReferenceResponse,
  SearchSkillsParams,
} from "../types";

interface WorkspaceSkillApi {
  details(): Promise<Skill>;
  listReferences(): Promise<ListReferencesResponse>;
  getReference(path: string): Promise<GetReferenceResponse>;
}

interface WorkspaceSkillsApi {
  listSkills(): Promise<ListSkillsResponse>;
  getSkill(name: string, path?: string): WorkspaceSkillApi;
  searchSkills(params: SearchSkillsParams): Promise<SearchSkillsResponse>;
}

interface WorkspaceSkillsClient {
  getWorkspace(workspaceId: string): WorkspaceSkillsApi;
}

const getWorkspaceSkillsClient = (client: unknown) => client as WorkspaceSkillsClient;

// =============================================================================
// Skills Hooks (via Workspace API)
// =============================================================================

/**
 * Hook to list all discovered skills via workspace
 */
export const useWorkspaceSkills = (options?: { workspaceId?: string }) => {
  const client = useMastraClient();

  return useQuery({
    enabled: !!options?.workspaceId && isWorkspaceV1Supported(client),
    queryFn: (): Promise<ListSkillsResponse> => {
      if (!isWorkspaceV1Supported(client)) {
        throw new Error("Workspace v1 not supported by core or client");
      }
      if (!options?.workspaceId) {
        throw new Error("workspaceId is required");
      }
      const workspace = getWorkspaceSkillsClient(client).getWorkspace(options.workspaceId);
      return workspace.listSkills();
    },
    queryKey: ["workspace", "skills", options?.workspaceId],
    retry: shouldRetryWorkspaceQuery,
  });
};

/**
 * Hook to get a specific skill's full details via workspace
 */
export const useWorkspaceSkill = (
  skillName: string,
  options?: { enabled?: boolean; workspaceId?: string; path?: string },
) => {
  const client = useMastraClient();

  return useQuery({
    enabled:
      options?.enabled !== false &&
      !!skillName &&
      !!options?.workspaceId &&
      isWorkspaceV1Supported(client),
    queryFn: (): Promise<Skill> => {
      if (!isWorkspaceV1Supported(client)) {
        throw new Error("Workspace v1 not supported by core or client");
      }
      if (!options?.workspaceId) {
        throw new Error("workspaceId is required");
      }
      const workspace = getWorkspaceSkillsClient(client).getWorkspace(options.workspaceId);
      const skill = workspace.getSkill(skillName, options?.path);
      return skill.details();
    },
    queryKey: ["workspace", "skills", skillName, options?.path, options?.workspaceId],
    retry: shouldRetryWorkspaceQuery,
  });
};

/**
 * Hook to list references for a skill via workspace
 */
export const useWorkspaceSkillReferences = (
  skillName: string,
  options?: { enabled?: boolean; workspaceId?: string; path?: string },
) => {
  const client = useMastraClient();

  return useQuery({
    enabled:
      options?.enabled !== false &&
      !!skillName &&
      !!options?.workspaceId &&
      isWorkspaceV1Supported(client),
    queryFn: (): Promise<ListReferencesResponse> => {
      if (!isWorkspaceV1Supported(client)) {
        throw new Error("Workspace v1 not supported by core or client");
      }
      if (!options?.workspaceId) {
        throw new Error("workspaceId is required");
      }
      const workspace = getWorkspaceSkillsClient(client).getWorkspace(options.workspaceId);
      const skill = workspace.getSkill(skillName, options?.path);
      return skill.listReferences();
    },
    queryKey: ["workspace", "skills", skillName, options?.path, "references", options?.workspaceId],
    retry: shouldRetryWorkspaceQuery,
  });
};

/**
 * Hook to get a specific reference file content via workspace
 */
export const useWorkspaceSkillReference = (
  skillName: string,
  referencePath: string,
  options?: { enabled?: boolean; workspaceId?: string; path?: string },
) => {
  const client = useMastraClient();

  return useQuery({
    enabled:
      options?.enabled !== false &&
      !!skillName &&
      !!referencePath &&
      !!options?.workspaceId &&
      isWorkspaceV1Supported(client),
    queryFn: (): Promise<GetReferenceResponse> => {
      if (!isWorkspaceV1Supported(client)) {
        throw new Error("Workspace v1 not supported by core or client");
      }
      if (!options?.workspaceId) {
        throw new Error("workspaceId is required");
      }
      const workspace = getWorkspaceSkillsClient(client).getWorkspace(options.workspaceId);
      const skill = workspace.getSkill(skillName, options?.path);
      return skill.getReference(referencePath);
    },
    queryKey: [
      "workspace",
      "skills",
      skillName,
      options?.path,
      "references",
      referencePath,
      options?.workspaceId,
    ],
    retry: shouldRetryWorkspaceQuery,
  });
};

/**
 * Hook to search across skills via workspace
 */
export const useSearchWorkspaceSkills = () => {
  const client = useMastraClient();

  return useMutation({
    mutationFn: (params: SearchSkillsParams): Promise<SearchSkillsResponse> => {
      if (!isWorkspaceV1Supported(client)) {
        throw new Error("Workspace v1 not supported by core or client");
      }
      const workspace = getWorkspaceSkillsClient(client).getWorkspace(params.workspaceId);
      return workspace.searchSkills(params);
    },
  });
};

// =============================================================================
// Agent-Specific Skill Hook
// =============================================================================

/**
 * Hook to get a specific skill from an agent's workspace
 * @param agentId - The agent ID (used for query key)
 * @param skillPath - The skill path to fetch
 * @param options - Options including workspaceId and enabled flag
 */
export const useAgentSkill = (
  agentId: string,
  skillName: string,
  options?: { enabled?: boolean; workspaceId?: string; path?: string },
) => {
  const client = useMastraClient();

  return useQuery({
    enabled:
      options?.enabled !== false &&
      !!agentId &&
      !!skillName &&
      !!options?.workspaceId &&
      isWorkspaceV1Supported(client),
    queryFn: (): Promise<Skill> => {
      if (!isWorkspaceV1Supported(client)) {
        throw new Error("Workspace v1 not supported by core or client");
      }
      if (!options?.workspaceId) {
        throw new Error("workspaceId is required");
      }
      const workspace = getWorkspaceSkillsClient(client).getWorkspace(options.workspaceId);
      const skill = workspace.getSkill(skillName, options?.path);
      return skill.details();
    },
    queryKey: ["agents", agentId, "skills", skillName, options?.path, options?.workspaceId],
    retry: shouldRetryWorkspaceQuery,
  });
};
