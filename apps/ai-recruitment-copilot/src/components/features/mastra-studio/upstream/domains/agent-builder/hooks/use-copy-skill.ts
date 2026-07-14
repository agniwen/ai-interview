import type { StoredSkillResponse } from "@mastra/client-js";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useMastraClient } from "@mastra/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { LibraryCopyOrigin } from "@/components/features/mastra-studio/upstream/domains/agent-builder/utils/skill-origin";

export interface CopySkillParams {
  /** The public Library skill being copied. */
  source: StoredSkillResponse;
  /** Name to give the new private copy. Should not collide with existing user skills. */
  name: string;
  /** Optional override of the description. Defaults to the source description. */
  description?: string;
}

/**
 * Copy a public Library skill into the caller's own catalog as a private skill.
 *
 * Users can take a public skill and customize it without affecting the
 * canonical version. We call `createStoredSkill` with the source's content and
 * an `origin: library-copy` tag so the UI can show provenance later.
 */
export function useCopySkill() {
  const client = useMastraClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: CopySkillParams): Promise<StoredSkillResponse> => {
      const { source, name } = params;
      const description = params.description ?? source.description ?? "";

      const origin: LibraryCopyOrigin = {
        sourceSkillId: source.id,
        sourceSkillName: source.name,
        type: "library-copy",
        ...(source.authorId ? { sourceAuthorId: source.authorId } : {}),
      };

      return client.createStoredSkill({
        description,
        ...(source.files === null || source.files === undefined ? {} : { files: source.files }),
        instructions: source.instructions,
        ...(source.license === null || source.license === undefined
          ? {}
          : { license: source.license }),
        metadata: {
          origin: { ...origin, copiedAt: new Date().toISOString() },
        },
        name,
        // Optional fields may come back as null from the source; the create
        // schema only accepts an object/array or omitted, so drop nulls.
        visibility: "private",
      });
    },
    onError: (error) => {
      toast.error(
        `Failed to copy skill: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["stored-skills"] });
      toast.success("Skill copied");
    },
  });
}
