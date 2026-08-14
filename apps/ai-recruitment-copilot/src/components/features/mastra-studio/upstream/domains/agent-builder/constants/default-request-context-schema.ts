/**
 * Default request-context schema attached to every stored agent created through
 * the Agent Builder. Describes a single `user` request-context variable whose
 * shape mirrors `CurrentUser` from `@/components/features/mastra-studio/upstream/domains/auth/types`:
 *
 *   { id: string; email?; name?; avatarUrl?; roles?: string[]; permissions?: string[] } | null
 *
 * This constant is set once at create-time and never touched by the save/
 * autosave path, so subsequent builder edits do not clobber user-provided
 * schemas in the future.
 */
export const DEFAULT_BUILDER_REQUEST_CONTEXT_SCHEMA = {
  properties: {
    required: ["user"],
    user: {
      properties: {
        avatarUrl: { type: "string" },
        email: { type: "string" },
        id: { type: "string" },
        name: { type: "string" },
        permissions: { items: { type: "string" }, type: "array" },
        roles: { items: { type: "string" }, type: "array" },
      },
      required: ["id"],
      type: "object",
    },
  },
  type: "object",
} as const satisfies Record<string, unknown>;
