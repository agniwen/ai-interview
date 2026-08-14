import { useMastraClient } from "@mastra/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  SkillsShSearchResponse,
  SkillsShListResponse,
  SkillsShInstallResponse,
  SkillsShRemoveResponse,
  SkillsShUpdateResponse,
} from "../types";

// =============================================================================
// skills.sh API Hooks (via server proxy to avoid CORS)
// =============================================================================

/**
 * Search skills on skills.sh (via server proxy)
 */
export const useSearchSkillsSh = (workspaceId: string | undefined) => {
  const client = useMastraClient();

  return useMutation({
    mutationFn: async (query: string): Promise<SkillsShSearchResponse> => {
      if (!workspaceId) {
        throw new Error("必须提供工作区 ID");
      }
      const baseUrl = client.options.baseUrl || "";
      const url = `${baseUrl}/api/workspaces/${workspaceId}/skills-sh/search?q=${encodeURIComponent(query)}&limit=10`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`搜索技能失败：${response.statusText}`);
      }
      return response.json().catch(() => {
        throw new Error("服务器响应无效");
      });
    },
  });
};

/**
 * Get popular skills from skills.sh (via server proxy, cached for 5 minutes)
 */
export const usePopularSkillsSh = (workspaceId: string | undefined) => {
  const client = useMastraClient();

  return useQuery({
    enabled: !!workspaceId,
    queryFn: async (): Promise<SkillsShListResponse> => {
      if (!workspaceId) {
        throw new Error("必须提供工作区 ID");
      }
      const baseUrl = client.options.baseUrl || "";
      const url = `${baseUrl}/api/workspaces/${workspaceId}/skills-sh/popular?limit=10&offset=0`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`获取热门技能失败：${response.statusText}`);
      }
      return response.json().catch(() => {
        throw new Error("服务器响应无效");
      });
    },
    queryKey: ["skills-sh", "popular", workspaceId],
    // 5 minutes
    staleTime: 5 * 60 * 1000,
  });
};

/**
 * Preview a skill by fetching its SKILL.md (via server proxy to avoid CORS)
 */
export const useSkillPreview = (
  workspaceId: string | undefined,
  owner: string | undefined,
  repo: string | undefined,
  skillPath: string | undefined,
  options?: { enabled?: boolean },
) => {
  const client = useMastraClient();

  return useQuery({
    enabled: options?.enabled !== false && !!workspaceId && !!owner && !!repo && !!skillPath,
    queryFn: async (): Promise<string> => {
      if (!workspaceId || !owner || !repo || !skillPath) {
        throw new Error("必须提供 workspaceId、owner、repo 和 skillPath");
      }
      const baseUrl = client.options.baseUrl || "";
      const params = new URLSearchParams({ owner, path: skillPath, repo });
      const url = `${baseUrl}/api/workspaces/${workspaceId}/skills-sh/preview?${params}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`获取预览失败：${response.statusText}`);
      }
      const data = await response.json().catch(() => {
        throw new Error("服务器响应无效");
      });
      return data.content;
    },
    queryKey: ["skills-sh", "preview", workspaceId, owner, repo, skillPath],
    retry: false,
  });
};

// =============================================================================
// Skill Management Hooks (via server proxy)
// =============================================================================

export interface InstallSkillParams {
  workspaceId: string;
  /** Repository in format owner/repo */
  repository: string;
  /** Skill name within the repo */
  skillName: string;
  /** Mount path to install into (for CompositeFilesystem) */
  mount?: string;
}

/**
 * Install a skill by fetching from GitHub and writing to workspace filesystem.
 */
export const useInstallSkill = () => {
  const client = useMastraClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: InstallSkillParams): Promise<SkillsShInstallResponse> => {
      const [owner, repo] = params.repository.split("/");
      if (!owner || !repo) {
        throw new Error("仓库格式无效，应为 owner/repo");
      }

      const baseUrl = client.options.baseUrl || "";
      const url = `${baseUrl}/api/workspaces/${params.workspaceId}/skills-sh/install`;
      const body: Record<string, string> = { owner, repo, skillName: params.skillName };
      if (params.mount) {
        body.mount = params.mount;
      }
      const response = await fetch(url, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || error.message || `安装技能失败：${response.statusText}`);
      }

      return response.json().catch(() => {
        throw new Error("服务器响应无效");
      });
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["workspace", "skills", variables.workspaceId],
      });
    },
  });
};

export interface UpdateSkillsParams {
  workspaceId: string;
  skillName?: string;
}

/**
 * Update installed skills by re-fetching from GitHub.
 */
export const useUpdateSkills = () => {
  const client = useMastraClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateSkillsParams): Promise<SkillsShUpdateResponse> => {
      const baseUrl = client.options.baseUrl || "";
      const url = `${baseUrl}/api/workspaces/${params.workspaceId}/skills-sh/update`;
      const response = await fetch(url, {
        body: JSON.stringify({ skillName: params.skillName }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || error.message || `更新技能失败：${response.statusText}`);
      }

      return response.json().catch(() => {
        throw new Error("服务器响应无效");
      });
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["workspace", "skills", variables.workspaceId],
      });
    },
  });
};

export interface RemoveSkillParams {
  workspaceId: string;
  skillName: string;
}

/**
 * Remove an installed skill by deleting its directory.
 */
export const useRemoveSkill = () => {
  const client = useMastraClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: RemoveSkillParams): Promise<SkillsShRemoveResponse> => {
      const baseUrl = client.options.baseUrl || "";
      const url = `${baseUrl}/api/workspaces/${params.workspaceId}/skills-sh/remove`;
      const response = await fetch(url, {
        body: JSON.stringify({ skillName: params.skillName }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || error.message || `移除技能失败：${response.statusText}`);
      }

      return response.json().catch(() => {
        throw new Error("服务器响应无效");
      });
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["workspace", "skills", variables.workspaceId],
      });
    },
  });
};

// =============================================================================
// Helper: Parse skills.sh skill ID to repository info
// =============================================================================

/**
 * Parse a skill's topSource field to extract GitHub repository info
 *
 * skills.sh topSource formats:
 * - "owner/repo" (e.g., "vercel-labs/agent-skills")
 * - "owner/repo/path" (e.g., "anthropics/skills/frontend-design")
 * - "github.com/owner/repo/path" (full URL format)
 *
 * The skill name is used as the path within the repo when not specified
 */
export function parseSkillSource(
  topSource: string,
  skillName?: string,
): {
  owner: string;
  repo: string;
  skillPath: string;
} | null {
  // Remove protocol and github.com prefix if present
  let cleanSource = topSource.replace(/^https?:\/\//, "");
  cleanSource = cleanSource.replace(/^github\.com\//, "");
  // Remove trailing slash if present
  cleanSource = cleanSource.replace(/\/$/, "");

  const parts = cleanSource.split("/").filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  const [owner, repo] = parts;

  // If there's a path in topSource, use it; otherwise use skill name
  let skillPath: string;
  if (parts.length > 2) {
    // Path is specified in topSource (e.g., "anthropics/skills/frontend-design")
    skillPath = parts.slice(2).join("/");
  } else if (skillName) {
    // No path in topSource, use skill name (e.g., for "vercel-labs/agent-skills" + skill "web-design-guidelines")
    skillPath = skillName;
  } else {
    return null;
  }

  return {
    owner,
    repo,
    skillPath,
  };
}
