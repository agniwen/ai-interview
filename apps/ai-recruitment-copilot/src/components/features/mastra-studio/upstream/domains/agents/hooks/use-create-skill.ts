import type { StoredSkillResponse } from "@mastra/client-js";
import { useMastraClient } from "@mastra/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  extractSkillInstructions,
  extractSkillLicense,
} from "../components/agent-cms-pages/skill-file-tree-utils";
import type { InMemoryFileNode } from "../components/agent-edit-page/utils/form-validation";
import { usePermissions } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/use-permissions";
import { useWriteWorkspaceFile } from "@/components/features/mastra-studio/upstream/domains/workspace/hooks";

interface CreateSkillParams {
  /** Optional client-generated id. When omitted, the server derives one from the name. */
  id?: string;
  name: string;
  description: string;
  instructions?: string;
  visibility?: "private" | "public";
  workspaceId?: string;
  files: InMemoryFileNode[];
}

function flattenFiles(
  nodes: InMemoryFileNode[],
  basePath: string,
): { path: string; content: string }[] {
  const results: { path: string; content: string }[] = [];
  for (const node of nodes) {
    const nodePath = basePath ? `${basePath}/${node.name}` : node.name;
    if (node.type === "file" && node.content !== undefined) {
      results.push({ content: node.content, path: nodePath });
    } else if (node.type === "folder" && node.children) {
      results.push(...flattenFiles(node.children, nodePath));
    }
  }
  return results;
}

export function useCreateSkill() {
  const client = useMastraClient();
  const queryClient = useQueryClient();
  const writeFile = useWriteWorkspaceFile();
  const { hasPermission } = usePermissions();
  const canWriteWorkspace = hasPermission("workspaces:write");

  return useMutation({
    mutationFn: async (params: CreateSkillParams): Promise<StoredSkillResponse> => {
      const { id, name, description, instructions, workspaceId, files } = params;

      // Write files to workspace filesystem (best-effort — DB is the source of truth)
      if (workspaceId && canWriteWorkspace) {
        const filesToWrite = flattenFiles(files, "");
        try {
          await Promise.all(
            filesToWrite.map((file) =>
              writeFile.mutateAsync({
                content: file.content,
                path: `skills/${file.path}`,
                recursive: true,
                workspaceId,
              }),
            ),
          );
        } catch (error) {
          console.warn("[skill] Workspace file write failed, saving to DB only:", error);
        }
      }

      // Create stored skill via API (DB record always created)
      return client.createStoredSkill({
        ...(id ? { id } : {}),
        description,
        files,
        instructions: instructions ?? extractSkillInstructions(files),
        license: extractSkillLicense(files),
        name,
        visibility: params.visibility,
      });
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["stored-skills"] });
      if (variables.workspaceId) {
        void queryClient.invalidateQueries({
          queryKey: ["workspace", "skills", variables.workspaceId],
        });
      }
    },
  });
}
