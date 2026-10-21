import { recruitingMcpCardSchema } from "@app/shared/recruiting-mcp-cards";
import type { RecruitingMcpCard } from "@app/shared/recruiting-mcp-cards";

interface ToolResultLike {
  content?: readonly { type: string; text?: string }[];
  isError?: boolean;
  structuredContent?: unknown;
}

export type CardReadResult = { card: RecruitingMcpCard } | { error: string };

const FALLBACK_ERROR = "暂时无法展示这条结果，请稍后重试。";

/**
 * 把工具结果解析成卡片：错误结果沿用服务端的中文提示；
 * structuredContent 不符合契约时视为不可展示，而不是渲染半截数据。
 */
export function readRecruitingCard(result: ToolResultLike): CardReadResult {
  if (result.isError) {
    const message = result.content?.find((item) => item.type === "text")?.text?.trim();
    return { error: message || FALLBACK_ERROR };
  }
  const parsed = recruitingMcpCardSchema.safeParse(result.structuredContent);
  return parsed.success ? { card: parsed.data } : { error: FALLBACK_ERROR };
}
