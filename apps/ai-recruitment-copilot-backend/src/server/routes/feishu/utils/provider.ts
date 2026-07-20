export const FEISHU_PROVIDER_IDS = ["feishu", "feishu-jiguang-hr"] as const;

export type FeishuProviderId = (typeof FEISHU_PROVIDER_IDS)[number];

const FEISHU_APP_CONFIG: Record<FeishuProviderId, { appIdEnv: string; appSecretEnv: string }> = {
  feishu: { appIdEnv: "FEISHU_APP_ID", appSecretEnv: "FEISHU_APP_SECRET" },
  "feishu-jiguang-hr": {
    appIdEnv: "FEISHU_APP_ID2",
    appSecretEnv: "FEISHU_APP_SECRET2",
  },
};

export function getFeishuAppCredentials(providerId: FeishuProviderId): {
  appId: string;
  appSecret: string;
} {
  const config = FEISHU_APP_CONFIG[providerId];
  const appId = process.env[config.appIdEnv];
  const appSecret = process.env[config.appSecretEnv];
  if (!appId || !appSecret) {
    throw new Error(`${config.appIdEnv} and ${config.appSecretEnv} are required`);
  }
  return { appId, appSecret };
}
