import { getBooleanEnv } from "../../../lib/server/env";

export const FEISHU_PROVIDER_IDS = ["feishu", "feishu-jiguang-hr"] as const;

export type FeishuProviderId = (typeof FEISHU_PROVIDER_IDS)[number];

export const DEFAULT_FEISHU_PROVIDER_ID = "feishu-jiguang-hr" satisfies FeishuProviderId;

export function isFeishuProviderId(value: string): value is FeishuProviderId {
  return FEISHU_PROVIDER_IDS.some((providerId) => providerId === value);
}

/** Provider used by newly-created Feishu resources when the user has both bindings. */
export function getPreferredFeishuProviderId(): FeishuProviderId {
  const configured = process.env.FEISHU_PREFERRED_PROVIDER_ID?.trim();
  if (!configured) {
    return DEFAULT_FEISHU_PROVIDER_ID;
  }
  if (!isFeishuProviderId(configured)) {
    throw new Error("FEISHU_PREFERRED_PROVIDER_ID must be feishu or feishu-jiguang-hr.");
  }
  return configured;
}

/** Login entries are presentation policy only; both OAuth providers remain registered. */
export function getFeishuLoginProviderIds(): FeishuProviderId[] {
  const preferredProviderId = getPreferredFeishuProviderId();
  if (!getBooleanEnv("FEISHU_LEGACY_LOGIN_ENABLED", false)) {
    return [preferredProviderId];
  }
  return [
    preferredProviderId,
    ...FEISHU_PROVIDER_IDS.filter((providerId) => providerId !== preferredProviderId),
  ];
}

/** Selects a provider for a new flow while allowing the only available legacy binding as fallback. */
export function selectPreferredFeishuProviderId(
  providerIds: Iterable<string>,
  persistedProviderId?: string | null,
): FeishuProviderId | undefined {
  const available = new Set([...providerIds].filter(isFeishuProviderId));
  if (
    persistedProviderId &&
    isFeishuProviderId(persistedProviderId) &&
    available.has(persistedProviderId)
  ) {
    return persistedProviderId;
  }
  const preferredProviderId = getPreferredFeishuProviderId();
  if (available.has(preferredProviderId)) {
    return preferredProviderId;
  }
  return FEISHU_PROVIDER_IDS.find((providerId) => available.has(providerId));
}

/**
 * Controls the optional Feishu reservation and lifecycle integration for
 * human interviews. The messaging bot has its own FEISHU_BOT_ENABLED switch.
 */
export function isFeishuHumanInterviewEnabled(): boolean {
  return process.env.FEISHU_HUMAN_INTERVIEW_ENABLED === "true";
}

interface FeishuAppConfig {
  appIdEnv: string;
  appSecretEnv: string;
  evaluationFolderTokenEnv: string;
}

interface FeishuAppCredentials {
  appId: string;
  appSecret: string;
}

const FEISHU_APP_CONFIG = {
  feishu: {
    appIdEnv: "FEISHU_APP_ID",
    appSecretEnv: "FEISHU_APP_SECRET",
    evaluationFolderTokenEnv: "FEISHU_EVALUATION_FOLDER_TOKEN",
  },
  "feishu-jiguang-hr": {
    appIdEnv: "FEISHU_APP_ID2",
    appSecretEnv: "FEISHU_APP_SECRET2",
    evaluationFolderTokenEnv: "FEISHU_JIGUANG_HR_EVALUATION_FOLDER_TOKEN",
  },
} satisfies Record<FeishuProviderId, FeishuAppConfig>;

export function getFeishuAppCredentials(providerId: FeishuProviderId): FeishuAppCredentials {
  const config = FEISHU_APP_CONFIG[providerId];
  const appId = process.env[config.appIdEnv];
  const appSecret = process.env[config.appSecretEnv];
  if (!appId || !appSecret) {
    throw new Error(`${config.appIdEnv} and ${config.appSecretEnv} are required`);
  }
  return { appId, appSecret };
}

export function getFeishuEvaluationFolderToken(providerId: FeishuProviderId): string | undefined {
  const value = process.env[FEISHU_APP_CONFIG[providerId].evaluationFolderTokenEnv]?.trim();
  return value || undefined;
}
