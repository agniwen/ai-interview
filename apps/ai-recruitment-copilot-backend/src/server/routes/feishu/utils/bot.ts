import { createPostgresState } from "@chat-adapter/state-pg";
import { createLarkAdapter } from "@larksuite/vercel-chat-adapter";
import { cardChildToFallbackText, Chat, isCardElement, toCardElement } from "chat";
import type { AdapterPostableMessage, CardChild, CardElement } from "chat";
import type { FeishuProviderId } from "./provider";
import { FEISHU_PROVIDER_IDS, getFeishuAppCredentials } from "./provider";
import { routeDM, routeGroupMention } from "./router";

type LarkAdapter = ReturnType<typeof createLarkAdapter>;
type FeishuBot = Chat;
type LarkHeaderTemplate = "blue" | "green" | "orange" | "red";

interface LarkInteractiveCard {
  config: {
    wide_screen_mode: boolean;
  };
  elements: LarkInteractiveElement[];
  header?: {
    template: LarkHeaderTemplate;
    title: {
      content: string;
      tag: "plain_text";
    };
  };
}

type LarkInteractiveElement =
  | {
      content: string;
      tag: "markdown";
    }
  | {
      fields: {
        is_short: boolean;
        text: {
          content: string;
          tag: "lark_md";
        };
      }[];
      tag: "div";
    }
  | {
      tag: "hr";
    }
  | {
      columns: {
        data_type: "text";
        display_name: string;
        name: string;
      }[];
      header_style: {
        background_style: "grey";
        bold: boolean;
      };
      page_size: number;
      row_height: "low";
      rows: Record<string, string>[];
      tag: "table";
    }
  | {
      actions: LarkInteractiveAction[];
      layout?: "bisected";
      tag: "action";
    };

type LarkInteractiveAction =
  | {
      text: {
        content: string;
        tag: "plain_text";
      };
      type?: "default" | "primary" | "danger";
      url: string;
      tag: "button";
    }
  | {
      text: {
        content: string;
        tag: "plain_text";
      };
      type?: "default" | "primary" | "danger";
      value: Record<string, unknown>;
      tag: "button";
    };

const cached = new Map<FeishuProviderId, { adapter: LarkAdapter; bot: FeishuBot }>();

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

function textStyleToMarkdown(content: string, style?: "plain" | "bold" | "muted"): string {
  if (style === "bold") {
    return `**${content}**`;
  }
  return content;
}

function tableToMarkdown(headers: string[], rows: string[][]): string {
  if (headers.length === 0) {
    return rows.map((row) => row.join(" | ")).join("\n");
  }
  const separator = headers.map(() => "---");
  return [headers, separator, ...rows].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function fieldToLarkMarkdown(field: { label: string; value: string }): string {
  return `**${field.label}**\n${field.value}`;
}

function tableToLarkElement(
  headers: string[],
  rows: string[][],
): Extract<LarkInteractiveElement, { tag: "table" }> | null {
  if (headers.length === 0 || rows.length === 0) {
    return null;
  }
  const columns = headers.map((header, index) => ({
    data_type: "text" as const,
    display_name: header,
    name: `col_${index}`,
  }));
  return {
    columns,
    header_style: {
      background_style: "grey",
      bold: true,
    },
    page_size: Math.min(Math.max(rows.length, 1), 10),
    row_height: "low",
    rows: rows.map((row) =>
      Object.fromEntries(columns.map((column, index) => [column.name, row[index] ?? ""])),
    ),
    tag: "table",
  };
}

function findCardFieldValue(children: CardChild[], label: string): string | null {
  for (const child of children) {
    if (child.type === "fields") {
      const field = child.children.find((item) => item.label === label);
      if (field) {
        return field.value;
      }
      continue;
    }
    if (child.type === "section") {
      const value = findCardFieldValue(child.children, label);
      if (value) {
        return value;
      }
    }
  }
  return null;
}

function resolveRecommendationHeaderTemplate(recommendation: string | null): LarkHeaderTemplate {
  if (!recommendation) {
    return "blue";
  }
  if (recommendation.includes("不建议") || recommendation.includes("不推荐")) {
    return "red";
  }
  if (recommendation.includes("待定")) {
    return "orange";
  }
  if (
    recommendation.includes("建议进入下一轮") ||
    recommendation.includes("推荐进入下一轮") ||
    recommendation.includes("推荐继续面试")
  ) {
    return "green";
  }
  return "blue";
}

function resolveCardHeaderTemplate(card: CardElement): LarkHeaderTemplate {
  return resolveRecommendationHeaderTemplate(findCardFieldValue(card.children, "推荐结论"));
}

function cardChildToLarkElements(child: CardChild): LarkInteractiveElement[] {
  switch (child.type) {
    case "actions": {
      const actions = child.children.flatMap((action): LarkInteractiveAction[] => {
        if (action.type === "link-button") {
          return [
            {
              tag: "button",
              text: { content: action.label, tag: "plain_text" },
              type: action.style,
              url: action.url,
            },
          ];
        }
        if (action.type === "button") {
          return [
            {
              tag: "button",
              text: { content: action.label, tag: "plain_text" },
              type: action.style,
              value: { actionId: action.id, value: action.value },
            },
          ];
        }
        return [];
      });
      return actions.length > 0 ? [{ actions, layout: "bisected", tag: "action" }] : [];
    }
    case "divider": {
      return [{ tag: "hr" }];
    }
    case "fields": {
      return child.children.length > 0
        ? [
            {
              fields: child.children.map((field) => ({
                is_short: true,
                text: {
                  content: fieldToLarkMarkdown(field),
                  tag: "lark_md",
                },
              })),
              tag: "div",
            },
          ]
        : [];
    }
    case "image": {
      return child.alt ? [{ content: `![${child.alt}](${child.url})`, tag: "markdown" }] : [];
    }
    case "link": {
      return [{ content: `[${child.label}](${child.url})`, tag: "markdown" }];
    }
    case "section": {
      return child.children.flatMap((sectionChild) => cardChildToLarkElements(sectionChild));
    }
    case "table": {
      const table = tableToLarkElement(child.headers, child.rows);
      return table
        ? [table]
        : [{ content: tableToMarkdown(child.headers, child.rows), tag: "markdown" }];
    }
    case "text": {
      return [{ content: textStyleToMarkdown(child.content, child.style), tag: "markdown" }];
    }
    default: {
      return [];
    }
  }
}

export function toLarkInteractiveCard(card: CardElement): LarkInteractiveCard {
  const elements: LarkInteractiveElement[] = [];
  if (card.subtitle) {
    elements.push({ content: card.subtitle, tag: "markdown" });
  }
  elements.push(...card.children.flatMap((child) => cardChildToLarkElements(child)));

  return {
    config: {
      wide_screen_mode: true,
    },
    elements:
      elements.length > 0
        ? elements
        : [
            {
              content: cardToFallbackText(card) || card.title || "通知",
              tag: "markdown",
            },
          ],
    header: card.title
      ? {
          template: resolveCardHeaderTemplate(card),
          title: {
            content: card.title,
            tag: "plain_text",
          },
        }
      : undefined,
  };
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

  const { appId, appSecret } = getFeishuAppCredentials(providerId);

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

export async function shutdownFeishuBots(): Promise<void> {
  const entries = [...cached.values()];
  await Promise.all(entries.map(({ bot }) => bot.shutdown()));
  cached.clear();
}

export async function initializeFeishuBots(): Promise<void> {
  try {
    await Promise.all(
      FEISHU_PROVIDER_IDS.map((providerId) => ensureFeishuBotInitialized(providerId)),
    );
  } catch (initializationError) {
    try {
      await shutdownFeishuBots();
    } catch (shutdownError) {
      throw new Error("Feishu bot initialization failed and rollback was incomplete.", {
        cause: shutdownError,
      });
    }
    throw initializationError;
  }
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

export async function trySendFeishuDirectCard(
  send: () => Promise<{ messageId: string }>,
): Promise<{ id: string | null }> {
  try {
    const sent = await send();
    return { id: sent.messageId };
  } catch {
    return { id: null };
  }
}

export async function postFeishuDirectCard(
  providerId: FeishuProviderId,
  openId: string,
  card: CardElement | unknown,
): Promise<{ id: string | null }> {
  return await trySendFeishuDirectCard(async () => {
    const { adapter } = await ensureFeishuBotInitialized(providerId);
    const channel = adapter._getChannel();
    if (!channel) {
      throw new Error(`Feishu bot channel is not initialized for provider ${providerId}`);
    }
    const cardElement = resolveCardElement(card);
    return await channel.send(openId, { card: toLarkInteractiveCard(cardElement) });
  });
}
