import { createPostgresState } from "@chat-adapter/state-pg";
import { createLarkAdapter } from "@larksuite/vercel-chat-adapter";
import { cardChildToFallbackText, Chat, isCardElement, toCardElement } from "chat";
import type { AdapterPostableMessage, CardElement } from "chat";
import type { FeishuProviderId } from "./provider";
import { FEISHU_PROVIDER_IDS } from "./provider";
import { routeDM, routeGroupMention } from "./router";

type LarkAdapter = ReturnType<typeof createLarkAdapter>;
type FeishuBot = Chat;

const cached = new Map<FeishuProviderId, { adapter: LarkAdapter; bot: FeishuBot }>();

const FEISHU_BOT_CONFIG: Record<
  FeishuProviderId,
  {
    appIdEnv: string;
    appSecretEnv: string;
  }
> = {
  feishu: {
    appIdEnv: "FEISHU_APP_ID",
    appSecretEnv: "FEISHU_APP_SECRET",
  },
  "feishu-jiguang-hr": {
    appIdEnv: "FEISHU_APP_ID2",
    appSecretEnv: "FEISHU_APP_SECRET2",
  },
};

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function resolveCardElement(card: CardElement | unknown): CardElement {
  if (isCardElement(card)) {
    return card;
  }
  const cardElement = toCardElement(card);
  if (!cardElement) {
    throw new Error("postFeishuDirectCard expects a Chat SDK CardElement or JSX card");
  }
  return cardElement;
}

function cardToFallbackText(card: CardElement): string {
  const parts = [
    card.title ? `**${card.title}**` : null,
    card.subtitle ?? null,
    ...card.children.map((child) => cardChildToFallbackText(child)),
  ];
  return parts.filter(Boolean).join("\n\n");
}

/**
 * Lazily construct the Feishu/Lark Chat instance. Uses a module-level cache
 * so each provider owns one official long-connection adapter per process.
 *
 * Throws (via createLarkAdapter) if FEISHU_APP_ID / FEISHU_APP_SECRET
 * are missing, so callers should only invoke this from request paths
 * (not at import time).
 */
export function getFeishuBot(providerId: FeishuProviderId = "feishu"): FeishuBot {
  const existing = cached.get(providerId);
  if (existing) {
    return existing.bot;
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

  const adapter = createLarkAdapter({
    appId,
    appSecret,
    userName: "resume-bot",
  });

  const bot = new Chat({
    adapters: {
      lark: adapter,
    },
    concurrency: "queue",
    dedupeTtlMs: 600_000,
    state: createPostgresState({ keyPrefix: `lark:${providerId}`, url: databaseUrl }),
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

  cached.set(providerId, { adapter, bot });
  return bot;
}

async function ensureFeishuBotInitialized(providerId: FeishuProviderId): Promise<{
  adapter: LarkAdapter;
  bot: FeishuBot;
}> {
  const bot = getFeishuBot(providerId);
  await bot.initialize();
  const entry = cached.get(providerId);
  if (!entry) {
    throw new Error(`Feishu bot is not initialized for provider ${providerId}`);
  }
  return entry;
}

export async function initializeFeishuBots(): Promise<void> {
  await Promise.all(
    FEISHU_PROVIDER_IDS.map((providerId) => ensureFeishuBotInitialized(providerId)),
  );
}

export async function shutdownFeishuBots(): Promise<void> {
  const entries = [...cached.values()];
  await Promise.all(entries.map(({ bot }) => bot.shutdown()));
  cached.clear();
}

export async function postFeishuDirectMessage(
  providerId: FeishuProviderId,
  openId: string,
  message: AdapterPostableMessage,
): Promise<{ id: string }> {
  const { adapter, bot } = await ensureFeishuBotInitialized(providerId);
  const threadId = await adapter.openDM(openId);
  const sent = await bot.thread(threadId).post(message);
  return { id: sent.id };
}

export async function postFeishuDirectCard(
  providerId: FeishuProviderId,
  openId: string,
  card: CardElement | unknown,
): Promise<{ id: string }> {
  const { adapter, bot } = await ensureFeishuBotInitialized(providerId);
  const threadId = await adapter.openDM(openId);
  const cardElement = resolveCardElement(card);
  const sent = await bot.thread(threadId).post({
    card: cardElement,
    fallbackText: cardToFallbackText(cardElement),
  });
  return { id: sent.id };
}
