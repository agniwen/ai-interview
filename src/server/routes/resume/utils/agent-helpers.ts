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
// 仅在出现显式招聘意图（"招聘 X" / "我需要 X 岗位 / 工程师 / 开发"）时才推断 role。
// 裸关键词（"前端"/"产品"/"数据"…）在候选人讨论里太常见，一旦命中就会触发自动 JD，
// 把 step 0 的岗位推荐工具调用整个跳过 —— 这就是"选择器有时不出"的根因。
// Only infer a role when the text carries explicit hiring intent. Bare keywords
// like "前端"/"产品"/"数据" appear constantly in candidate discussion; matching
// them auto-generates a JD and silently suppresses the suggest_job_description
// tool call — which is exactly why the picker sometimes failed to appear.
const ROLE_INFER_PATTERNS = [
  // "招聘 X" / "我需要招聘 X" —— 最直接的招聘表述
  // "招聘 X" / "我need to hire X" — most explicit hiring phrasing
  /(?:我需要招聘|我们需要招聘|需要招聘|招聘)\s*([^，。；\n]{1,24})/,
  // "我需要 X" 类句式，必须以 岗位/职位/方向/人员/工程师/开发 等岗位后缀结尾，
  // 否则 "我需要分析这份简历" 这种句子会被误判为招聘意图。
  // "我需要 X" variants — suffix is mandatory so that "我需要分析这份简历" no
  // longer slips through.
  /(?:我需要|我们需要|需要)\s*([^，。；\n]{1,24}?)(?:岗位|职位|方向|人员|工程师|开发|的人)/,
];
const ROLE_STRIP_TERMS_REGEX = /(一名|一位|一个|若干|岗位|职位|方向|人员|的)/g;

export function inferRoleFromText(text: string): string | null {
  const normalized = text.replace(NORMALIZE_WHITESPACE_REGEX, " ").trim();

  if (!normalized) {
    return null;
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
