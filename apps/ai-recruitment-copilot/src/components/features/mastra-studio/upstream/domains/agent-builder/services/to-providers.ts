import type { ListAgentsModelProvidersResponse, Provider } from "@mastra/client-js";

export type ListProvider = ListAgentsModelProvidersResponse["providers"][number] & {
  models: string[];
};

export function toProviders(providers: ListProvider[]): Provider[] {
  return providers.map((provider) => ({
    connected: false,
    description: provider.description,
    envVar: "",
    id: provider.id,
    label: provider.label,
    models: provider.models || [],
    name: provider.name,
  }));
}
