import type { StoredAgentResponse } from "@mastra/client-js";

/**
 * Minimal stored-agent record returned by `POST /stored/agents` when Studio
 * creates the first override for a code-defined agent. Only the required shape
 * of `StoredAgentResponse` is populated — the create mutation's onSuccess
 * handler only reads `id`.
 */
export const createdCodeAgent: StoredAgentResponse = {
  createdAt: "2026-06-16T00:00:00.000Z",
  id: "code-override-editable",
  instructions: "Original code instructions for editable override agent.",
  model: { name: "__AI_SDK_OPENAI_MODEL_BASE__", provider: "openai" },
  name: "Code Override Editable",
  status: "draft",
  updatedAt: "2026-06-16T00:00:00.000Z",
};
