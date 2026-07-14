import type {
  ListToolProviderToolkitsResponse,
  ListToolProvidersResponse,
} from "@mastra/client-js";

export const composioProvider: ListToolProvidersResponse = {
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

export const GMAIL_ICON_URL = "https://example.com/icons/gmail.png";

export const composioToolkits: ListToolProviderToolkitsResponse = {
  data: [
    { icon: GMAIL_ICON_URL, name: "Gmail", slug: "gmail" },
    { name: "Slack", slug: "slack" },
  ],
};
