import type {
  ChannelPlatformInfo,
  ChannelInstallationInfo,
  GetSystemPackagesResponse,
} from "@mastra/client-js";

export const systemPackages: GetSystemPackagesResponse = {
  cmsEnabled: false,
  isDev: false,
  observabilityEnabled: false,
  packages: [],
};

export const emptyPlatforms: ChannelPlatformInfo[] = [];

export const slackPlatform: ChannelPlatformInfo[] = [
  {
    id: "slack",
    isConfigured: true,
    name: "Slack",
  },
];

export const slackAndDiscordPlatforms: ChannelPlatformInfo[] = [
  {
    id: "slack",
    isConfigured: true,
    name: "Slack",
  },
  {
    id: "discord",
    isConfigured: false,
    name: "Discord",
  },
];

export const slackInstallations: ChannelInstallationInfo[] = [
  {
    agentId: "agent-1",
    displayName: "Workspace",
    id: "install-1",
    platform: "slack",
    status: "active",
  },
];

export const noSlackInstallations: ChannelInstallationInfo[] = [];
