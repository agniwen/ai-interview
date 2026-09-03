import { cardChildToFallbackText, isCardElement, toCardElement } from "chat";
import type { CardChild, CardElement } from "chat";
import { Resend } from "resend";
import { z } from "zod";

export const FEISHU_PROVIDER_IDS = ["feishu", "feishu-jiguang-hr"] as const;
export type FeishuProviderId = (typeof FEISHU_PROVIDER_IDS)[number];

const FEISHU_API_BASE = "https://open.feishu.cn/open-apis";
const FEISHU_REQUEST_TIMEOUT_MS = 15_000;

const FEISHU_APP_CONFIG = {
  feishu: {
    appIdEnv: "FEISHU_APP_ID",
    appSecretEnv: "FEISHU_APP_SECRET",
  },
  "feishu-jiguang-hr": {
    appIdEnv: "FEISHU_APP_ID2",
    appSecretEnv: "FEISHU_APP_SECRET2",
  },
} satisfies Record<FeishuProviderId, { appIdEnv: string; appSecretEnv: string }>;

const feishuTokenResponseSchema = z.object({
  code: z.number(),
  msg: z.string().optional(),
  tenant_access_token: z.string().optional(),
});

const feishuMessageResponseSchema = z.object({
  code: z.number(),
  data: z.object({ message_id: z.string().optional() }).optional(),
  msg: z.string().optional(),
});

type LarkInteractiveElement =
  | { content: string; tag: "markdown" }
  | {
      fields: { is_short: boolean; text: { content: string; tag: "lark_md" } }[];
      tag: "div";
    }
  | { tag: "hr" }
  | {
      columns: { data_type: "text"; display_name: string; name: string }[];
      header_style: { background_style: "grey"; bold: boolean };
      page_size: number;
      row_height: "low";
      rows: Record<string, string>[];
      tag: "table";
    }
  | { actions: LarkInteractiveAction[]; layout?: "bisected"; tag: "action" };

interface LarkInteractiveButtonValue {
  actionId: string;
  value?: string;
}

type LarkInteractiveAction =
  | {
      tag: "button";
      text: { content: string; tag: "plain_text" };
      type?: "default" | "primary" | "danger";
      url: string;
    }
  | {
      tag: "button";
      text: { content: string; tag: "plain_text" };
      type?: "default" | "primary" | "danger";
      value: LarkInteractiveButtonValue;
    };

interface LarkInteractiveCard {
  config: { wide_screen_mode: boolean };
  elements: LarkInteractiveElement[];
  header?: {
    template: "blue" | "green" | "orange" | "red";
    title: { content: string; tag: "plain_text" };
  };
}

let resendClient: Resend | null = null;

export function getResendClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY 未配置");
  }
  resendClient ??= new Resend(key);
  return resendClient;
}

function getResendFrom(): string {
  const from = process.env.RESEND_FROM;
  if (!from) {
    throw new Error("RESEND_FROM 未配置");
  }
  return from;
}

function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match?.[1] ?? raw).trim();
}

export function buildSenderFromAddress(companyName?: string): string {
  const address = extractEmailAddress(getResendFrom());
  const trimmed = companyName?.trim();
  return `${trimmed ? `${trimmed} AI HR` : "AI HR"} <${address}>`;
}

function feishuProviderError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function getFeishuCredentials(providerId: FeishuProviderId) {
  const config = FEISHU_APP_CONFIG[providerId];
  const appId = process.env[config.appIdEnv];
  const appSecret = process.env[config.appSecretEnv];
  if (!(appId && appSecret)) {
    throw feishuProviderError(
      "configuration_error",
      `${config.appIdEnv} and ${config.appSecretEnv} are required`,
    );
  }
  return { appId, appSecret };
}

async function fetchFeishu(input: string | URL | Request, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(FEISHU_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw feishuProviderError("send_timeout", "飞书消息发送超时。");
    }
    throw feishuProviderError("unknown", error instanceof Error ? error.message : "飞书请求失败。");
  }
}

async function getFeishuTenantAccessToken(providerId: FeishuProviderId): Promise<string> {
  const { appId, appSecret } = getFeishuCredentials(providerId);
  const response = await fetchFeishu(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (response.status === 429) {
    throw feishuProviderError("rate_limited", "飞书访问令牌请求频率受限。");
  }
  const parsed = feishuTokenResponseSchema.safeParse(await response.json());
  if (
    !(response.ok && parsed.success && parsed.data.code === 0 && parsed.data.tenant_access_token)
  ) {
    const code = parsed.success ? String(parsed.data.code) : `http_${response.status}`;
    const message = parsed.success ? parsed.data.msg : undefined;
    throw feishuProviderError(code, message || "获取飞书访问令牌失败。");
  }
  return parsed.data.tenant_access_token;
}

function resolveCardElement(card: CardElement | unknown): CardElement {
  if (isCardElement(card)) {
    return card;
  }
  const cardElement = toCardElement(card);
  if (!cardElement) {
    throw feishuProviderError("card_invalid", "飞书通知卡片格式无效。");
  }
  return cardElement;
}

function tableToMarkdown(headers: string[], rows: string[][]): string {
  if (headers.length === 0) {
    return rows.map((row) => row.join(" | ")).join("\n");
  }
  return [headers, headers.map(() => "---"), ...rows]
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");
}

function cardChildToLarkElements(child: CardChild): LarkInteractiveElement[] {
  if (child.type === "actions") {
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
        const value: LarkInteractiveButtonValue = { actionId: action.id };
        if (action.value !== undefined) {
          value.value = action.value;
        }
        return [
          {
            tag: "button",
            text: { content: action.label, tag: "plain_text" },
            type: action.style,
            value,
          },
        ];
      }
      return [];
    });
    return actions.length > 0 ? [{ actions, layout: "bisected", tag: "action" }] : [];
  }
  if (child.type === "divider") {
    return [{ tag: "hr" }];
  }
  if (child.type === "fields") {
    return child.children.length > 0
      ? [
          {
            fields: child.children.map((field) => ({
              is_short: true,
              text: { content: `**${field.label}**\n${field.value}`, tag: "lark_md" },
            })),
            tag: "div",
          },
        ]
      : [];
  }
  if (child.type === "image") {
    return child.alt ? [{ content: `![${child.alt}](${child.url})`, tag: "markdown" }] : [];
  }
  if (child.type === "link") {
    return [{ content: `[${child.label}](${child.url})`, tag: "markdown" }];
  }
  if (child.type === "section") {
    return child.children.flatMap(cardChildToLarkElements);
  }
  if (child.type === "table") {
    if (child.headers.length === 0 || child.rows.length === 0) {
      return [{ content: tableToMarkdown(child.headers, child.rows), tag: "markdown" }];
    }
    const columns = child.headers.map((header, index) => ({
      data_type: "text" as const,
      display_name: header,
      name: `col_${index}`,
    }));
    return [
      {
        columns,
        header_style: { background_style: "grey", bold: true },
        page_size: Math.min(Math.max(child.rows.length, 1), 10),
        row_height: "low",
        rows: child.rows.map((row) =>
          Object.fromEntries(columns.map((column, index) => [column.name, row[index] ?? ""])),
        ),
        tag: "table",
      },
    ];
  }
  if (child.type === "text") {
    return [
      {
        content: child.style === "bold" ? `**${child.content}**` : child.content,
        tag: "markdown",
      },
    ];
  }
  return [];
}

function findCardFieldValue(children: CardChild[], label: string): string | null {
  for (const child of children) {
    if (child.type === "fields") {
      const field = child.children.find((item) => item.label === label);
      if (field) {
        return field.value;
      }
    } else if (child.type === "section") {
      const value = findCardFieldValue(child.children, label);
      if (value) {
        return value;
      }
    }
  }
  return null;
}

function resolveHeaderTemplate(card: CardElement): "blue" | "green" | "orange" | "red" {
  const recommendation = findCardFieldValue(card.children, "推荐结论");
  if (recommendation?.includes("不建议") || recommendation?.includes("不推荐")) {
    return "red";
  }
  if (recommendation?.includes("待定")) {
    return "orange";
  }
  if (
    recommendation?.includes("建议进入下一轮") ||
    recommendation?.includes("推荐进入下一轮") ||
    recommendation?.includes("推荐继续面试")
  ) {
    return "green";
  }
  return "blue";
}

function toLarkInteractiveCard(card: CardElement): LarkInteractiveCard {
  const elements: LarkInteractiveElement[] = [];
  if (card.subtitle) {
    elements.push({ content: card.subtitle, tag: "markdown" });
  }
  elements.push(...card.children.flatMap(cardChildToLarkElements));
  return {
    config: { wide_screen_mode: true },
    elements:
      elements.length > 0
        ? elements
        : [
            {
              content:
                [
                  card.title ? `**${card.title}**` : null,
                  card.subtitle ?? null,
                  ...card.children.map(cardChildToFallbackText),
                ]
                  .filter(Boolean)
                  .join("\n\n") || "通知",
              tag: "markdown",
            },
          ],
    header: card.title
      ? {
          template: resolveHeaderTemplate(card),
          title: { content: card.title, tag: "plain_text" },
        }
      : undefined,
  };
}

export async function postFeishuDirectCard(
  providerId: FeishuProviderId,
  openId: string,
  card: CardElement | unknown,
): Promise<{ id: string }> {
  const token = await getFeishuTenantAccessToken(providerId);
  const content = toLarkInteractiveCard(resolveCardElement(card));
  const response = await fetchFeishu(`${FEISHU_API_BASE}/im/v1/messages?receive_id_type=open_id`, {
    body: JSON.stringify({
      content: JSON.stringify(content),
      msg_type: "interactive",
      receive_id: openId,
    }),
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    method: "POST",
  });
  if (response.status === 429) {
    throw feishuProviderError("rate_limited", "飞书消息发送频率受限。");
  }
  const parsed = feishuMessageResponseSchema.safeParse(await response.json());
  const messageId = parsed.success ? parsed.data.data?.message_id : undefined;
  if (!(response.ok && parsed.success && parsed.data.code === 0 && messageId)) {
    const code = parsed.success ? String(parsed.data.code) : `http_${response.status}`;
    const message = parsed.success ? parsed.data.msg : undefined;
    throw feishuProviderError(code, message || "飞书卡片发送失败。");
  }
  return { id: messageId };
}
