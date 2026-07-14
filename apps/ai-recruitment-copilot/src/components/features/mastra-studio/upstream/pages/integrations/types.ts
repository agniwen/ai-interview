import type { ListToolProviderConnectionsResponse } from "@mastra/client-js";

import type { useToolProviders } from "@/components/features/mastra-studio/upstream/domains/tool-providers/hooks/use-tool-providers";
import type { useToolkits } from "@/components/features/mastra-studio/upstream/domains/tool-providers/hooks/use-toolkits";

export type ConnectionItem = ListToolProviderConnectionsResponse["items"][number];
export type ProviderItem = NonNullable<
  ReturnType<typeof useToolProviders>["data"]
>["providers"][number];
export type ToolkitItem = NonNullable<ReturnType<typeof useToolkits>["data"]>["data"][number];
export type GroupedConnections = [string, ConnectionItem[]][];
