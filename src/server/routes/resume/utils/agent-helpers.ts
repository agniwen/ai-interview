import type { ModelMessage, UIMessage } from "ai";
import type { ResumeParserStructured } from "@/lib/shared/resume-parser-schema";

/**
 * 已经在 message 里 baked 的简历解析结果，suggest_job_description 直接拿来用。
 * Pre-baked resume parse data already in the user message — used by
 * suggest_job_description without any OCR / DB roundtrip.
 */
export interface BakedParsedResume {
  attachmentId: string;
  filename: string;
  parsedStructured: ResumeParserStructured;
}

export const SERVER_TIME_ZONE = "Asia/Shanghai";

export function stripNonImageFileParts(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((message) => {
    if (message.role !== "user" || typeof message.content === "string") {
      return message;
    }

    const filtered = message.content.filter(
      (part) => part.type !== "file" || part.mediaType.startsWith("image/"),
    );

    return { ...message, content: filtered };
  });
}

export function extractUserText(messages: UIMessage[]): string {
  return messages
    .filter((message) => message.role === "user")
    .flatMap((message) => message.parts)
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

const NORMALIZE_WHITESPACE_REGEX = /\s+/g;
const ROLE_KEYWORD_MAP: { keyword: RegExp; role: string }[] = [
  { keyword: /行政/, role: "行政" },
  { keyword: /人事|HR/, role: "人力资源" },
  { keyword: /运营/, role: "运营" },
  { keyword: /产品/, role: "产品" },
  { keyword: /前端/, role: "前端开发" },
  { keyword: /后端|服务端|后台/, role: "后端开发" },
  { keyword: /测试|QA/, role: "测试" },
  { keyword: /数据分析|数据/, role: "数据分析" },
  { keyword: /设计|UI|UX/, role: "设计" },
  { keyword: /财务/, role: "财务" },
];
const ROLE_INFER_PATTERNS = [
  /(?:我需要招聘|我们需要招聘|需要招聘|招聘)\s*([^，。；\n]{1,24})/,
  /(?:我需要|我们需要|需要)\s*([^，。；\n]{1,24})(?:岗位|职位|方向|人员)?/,
];
const ROLE_STRIP_TERMS_REGEX = /(一名|一位|一个|若干|岗位|职位|方向|人员|的)/g;

export function inferRoleFromText(text: string): string | null {
  const normalized = text.replace(NORMALIZE_WHITESPACE_REGEX, " ").trim();

  if (!normalized) {
    return null;
  }

  for (const item of ROLE_KEYWORD_MAP) {
    if (item.keyword.test(normalized)) {
      return item.role;
    }
  }

  for (const pattern of ROLE_INFER_PATTERNS) {
    const match = normalized.match(pattern);

    if (!match?.[1]) {
      continue;
    }

    const role = match[1].replace(ROLE_STRIP_TERMS_REGEX, "").trim();

    if (role.length > 0) {
      return role;
    }
  }

  return null;
}
