export const FEISHU_PROVIDER_IDS = ["feishu", "feishu-jiguang-hr"] as const;

export type FeishuProviderId = (typeof FEISHU_PROVIDER_IDS)[number];
