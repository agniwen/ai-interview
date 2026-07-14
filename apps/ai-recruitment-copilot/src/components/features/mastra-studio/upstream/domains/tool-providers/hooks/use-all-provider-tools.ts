import { useMastraClient } from "@mastra/react";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import { useToolProviders } from "./use-tool-providers";

export interface AvailableIntegrationTool {
  providerId: string;
  slug: string;
  toolkit: string;
  name?: string;
  description?: string;
}

/**
 * Upper bound for a single Composio-style `listTools` call. Composio's SDK has
 * no cursor — only `limit` — so we ask for a large page and fan out per
 * `toolkit` to avoid being truncated when many toolkits are allowlisted.
 */
const PER_SERVICE_LIMIT = 500;

/**
 * Returns every tool surfaced by every registered ToolProvider, scoped to
 * the provider's `allowedToolkits`/`allowedTools` filter (enforced
 * server-side). Used to render the full available-tools list inline.
 */
export const useAllProviderTools = () => {
  const client = useMastraClient();
  const integrationsQuery = useToolProviders();
  const integrations = useMemo(
    () => integrationsQuery.data?.providers ?? [],
    [integrationsQuery.data?.providers],
  );

  // 1. For every integration, fetch its tool services.
  const serviceQueries = useQueries({
    queries: integrations.map((integration) => ({
      queryFn: () => client.getToolProvider(integration.id).listToolkits(),
      queryKey: ["tool-integration-services", integration.id],
    })),
  });

  // 2. Flatten to (providerId, serviceSlug) pairs.
  const servicePairs = useMemo(() => {
    const pairs: { providerId: string; toolkit: string }[] = [];
    integrations.forEach((integration, idx) => {
      const services = serviceQueries[idx]?.data?.data ?? [];
      for (const service of services) {
        pairs.push({ providerId: integration.id, toolkit: service.slug });
      }
    });
    return pairs;
  }, [integrations, serviceQueries]);

  // 3. Fan out one tools query per (integration, service).
  const toolsQueries = useQueries({
    queries: servicePairs.map((pair) => ({
      queryFn: () =>
        client
          .getToolProvider(pair.providerId)
          .listTools({ perPage: PER_SERVICE_LIMIT, toolkit: pair.toolkit }),
      queryKey: ["tool-integration-tools-all", pair.providerId, pair.toolkit],
    })),
  });

  const isLoading =
    integrationsQuery.isLoading ||
    serviceQueries.some((q) => q.isLoading) ||
    toolsQueries.some((q) => q.isLoading);

  const tools = useMemo<AvailableIntegrationTool[]>(() => {
    const out: AvailableIntegrationTool[] = [];
    servicePairs.forEach((pair, idx) => {
      const items = toolsQueries[idx]?.data?.data ?? [];
      for (const item of items) {
        const toolkit = (item as { toolkit?: string }).toolkit ?? pair.toolkit;
        out.push({
          description: (item as { description?: string }).description,
          name: (item as { name?: string }).name,
          providerId: pair.providerId,
          slug: item.slug,
          toolkit,
        });
      }
    });
    return out;
  }, [servicePairs, toolsQueries]);

  return { isLoading, tools };
};
