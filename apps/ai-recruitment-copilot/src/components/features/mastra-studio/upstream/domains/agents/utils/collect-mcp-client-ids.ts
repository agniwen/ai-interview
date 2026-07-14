import type { MastraClient } from "@mastra/client-js";

import type { AgentFormValues } from "../components/agent-edit-page/utils/form-validation";

type MCPClientEntry = NonNullable<AgentFormValues["mcpClients"]>[number];

export async function collectMCPClientIds(
  mcpClients: MCPClientEntry[],
  client: MastraClient,
): Promise<string[]> {
  const existingIds = mcpClients
    .map((mcpClient) => mcpClient.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const newIds = await Promise.all(
    mcpClients
      .filter((c) => !c.id)
      .map((c) =>
        client
          .createStoredMCPClient({ description: c.description, name: c.name, servers: c.servers })
          .then((r) => r.id),
      ),
  );
  return [...existingIds, ...newIds];
}
