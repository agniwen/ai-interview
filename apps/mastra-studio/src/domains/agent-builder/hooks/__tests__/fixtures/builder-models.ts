import type { BuilderAvailableModelsResponse, Provider } from "@mastra/client-js";

/**
 * The full set of providers/models the picker knows about, before any policy
 * filtering. Used as the `providers`/`allModels` input to the hooks under test.
 */
export const allProviders: Provider[] = [
  {
    connected: true,
    envVar: "OPENAI_API_KEY",
    id: "openai",
    models: ["gpt-4o", "gpt-4o-mini"],
    name: "OpenAI",
  },
  {
    connected: true,
    envVar: "ANTHROPIC_API_KEY",
    id: "anthropic",
    models: ["claude-opus-4-7", "claude-haiku-4-5"],
    name: "Anthropic",
  },
  {
    connected: false,
    envVar: "ACME_API_KEY",
    id: "acme/gateway",
    models: ["acme-mini"],
    name: "Acme Gateway",
  },
];

/** Build a typed `GET /editor/builder/models/available` response. */
export const availableModelsResponse = (providers: Provider[]): BuilderAvailableModelsResponse => ({
  providers,
});
