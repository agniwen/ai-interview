import { createPostgresState } from "@chat-adapter/state-pg";
import { createFeishuAdapter } from "@repo/adapter-feishu";
import { Chat } from "chat";
import { routeDM, routeGroupMention } from "./router";

export const FEISHU_PROVIDER_IDS = ["feishu", "feishu-jiguang-hr"] as const;
export type FeishuProviderId = (typeof FEISHU_PROVIDER_IDS)[number];

type FeishuBot = Chat<{ feishu: ReturnType<typeof createFeishuAdapter> }>;

const cached = new Map<FeishuProviderId, FeishuBot>();

const FEISHU_BOT_CONFIG: Record<
  FeishuProviderId,
  {
    appIdEnv: string;
    appSecretEnv: string;
    encryptKeyEnv?: string;
    verificationTokenEnv?: string;
  }
> = {
  feishu: {
    appIdEnv: "FEISHU_APP_ID",
    appSecretEnv: "FEISHU_APP_SECRET",
    encryptKeyEnv: "FEISHU_ENCRYPT_KEY",
    verificationTokenEnv: "FEISHU_VERIFICATION_TOKEN",
  },
  "feishu-jiguang-hr": {
    appIdEnv: "FEISHU_APP_ID2",
    appSecretEnv: "FEISHU_APP_SECRET2",
    encryptKeyEnv: "FEISHU_ENCRYPT_KEY2",
    verificationTokenEnv: "FEISHU_VERIFICATION_TOKEN2",
  },
};

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

/**
 * Lazily construct the Feishu Chat instance. Uses a module-level cache
 * so a single instance is shared across requests in the same process.
 *
 * Throws (via createFeishuAdapter) if FEISHU_APP_ID / FEISHU_APP_SECRET
 * are missing, so callers should only invoke this from request paths
 * (not at import time).
 */
export function getFeishuBot(providerId: FeishuProviderId = "feishu"): FeishuBot {
  const existing = cached.get(providerId);
  if (existing) {
    return existing;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for the Feishu bot state adapter");
  }

  const config = FEISHU_BOT_CONFIG[providerId];
  const appId = getEnv(config.appIdEnv);
  const appSecret = getEnv(config.appSecretEnv);
  if (!appId || !appSecret) {
    throw new Error(`${config.appIdEnv} and ${config.appSecretEnv} are required`);
  }

  const bot = new Chat({
    adapters: {
      feishu: createFeishuAdapter({
        appId,
        appSecret,
        encryptKey: config.encryptKeyEnv
          ? (getEnv(config.encryptKeyEnv) ?? getEnv("FEISHU_ENCRYPT_KEY"))
          : undefined,
        userName: "resume-bot",
        verificationToken: config.verificationTokenEnv
          ? (getEnv(config.verificationTokenEnv) ?? getEnv("FEISHU_VERIFICATION_TOKEN"))
          : undefined,
      }),
    },
    concurrency: "queue",
    dedupeTtlMs: 600_000,
    state: createPostgresState({ keyPrefix: `feishu:${providerId}`, url: databaseUrl }),
    userName: "resume-bot",
  });

  bot.onDirectMessage(async (thread, message, _channel, context) => {
    await thread.subscribe();
    await routeDM(thread, message, context);
  });

  // 中文：群里 @bot 时回引导文案；非 mention 的群消息忽略
  // English: reply with the greeter when @-mentioned in a group; ignore other group chatter
  bot.onNewMention(async (thread, message, context) => {
    await routeGroupMention(thread, message, context);
  });

  // 中文：卡片按钮回调将在 Workflow 3（面试结果通知）的决策按钮里使用
  // English: card-action handlers will be wired in Workflow 3 (decision buttons)

  cached.set(providerId, bot);
  return bot;
}
