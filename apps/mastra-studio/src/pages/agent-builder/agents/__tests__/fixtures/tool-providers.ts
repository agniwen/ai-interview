import type {
  ListToolProviderConnectionsResponse,
  ListToolProviderToolkitsResponse,
  ListToolProviderToolsResponse,
  ListToolProvidersResponse,
} from "@mastra/client-js";

export const composioProviderList: ListToolProvidersResponse = {
  providers: [
    {
      capabilities: {
        batchConnectionStatus: true,
        multipleConnectionsPerToolkit: true,
        reauthorizeReusesConnectionId: true,
      },
      id: "composio",
      name: "Composio",
    },
  ],
};

export const composioToolkits: ListToolProviderToolkitsResponse = {
  data: [{ name: "Gmail", slug: "gmail" }],
};

export const composioGmailTools: ListToolProviderToolsResponse = {
  data: [
    {
      description: "Fetch emails from Gmail",
      name: "Fetch emails",
      slug: "GMAIL_FETCH_EMAILS",
      toolkit: "gmail",
    },
  ],
};

export const composioGmailConnections: ListToolProviderConnectionsResponse = {
  items: [
    {
      authorId: "user-1",
      connectionId: "conn-gmail",
      createdAt: "2026-04-29T10:00:00.000Z",
      label: "Gmail",
      status: "active",
    },
  ],
  pagination: {
    hasMore: false,
    page: 1,
    perPage: 50,
    total: 1,
  },
};
