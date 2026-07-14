import type {
  ListToolProviderConnectionsResponse,
  ListToolProviderToolkitsResponse,
  ListToolProvidersResponse,
} from "@mastra/client-js";

export const composioProviders: ListToolProvidersResponse = {
  providers: [{ displayName: "Composio", id: "composio", name: "Composio" }],
};

export const composioToolkits: ListToolProviderToolkitsResponse = {
  data: [{ name: "Gmail", slug: "gmail" }],
};

export const adminConnections: ListToolProviderConnectionsResponse = {
  items: [
    { authorId: "shared", connectionId: "conn_shared", label: "Shared", status: "active" },
    { connectionId: "conn_unknown", label: "Unknown author", status: "active" },
    { authorId: "user_B", connectionId: "conn_b", label: "B", status: "active" },
    { authorId: "user_A", connectionId: "conn_a", label: "A", status: "active" },
  ],
};
