import type { PartialField } from "./types";

const LEADING_DIGIT_RE = /^\d/;
const LEADING_DIGITS_RE = /^(\d+)/;

export async function dataUrlToFile(url: string, filename: string): Promise<File> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || "application/octet-stream" });
}

const FIELD_MAP: { key: string; label: string }[] = [
  { key: '"name"', label: "姓名" },
  { key: '"gender"', label: "性别" },
  { key: '"age"', label: "年龄" },
  { key: '"workYears"', label: "工作年限" },
  { key: '"targetRoles"', label: "目标岗位" },
  { key: '"skills"', label: "技能" },
  { key: '"schools"', label: "院校" },
];

// 从流式输出的 partial JSON 文本里抽出已闭合的字段，给用户立刻有反馈。
// 解析失败/未闭合的字段直接跳过——下一帧会再尝试。
// Pull closed fields out of the streaming partial-JSON text so the UI can
// surface them immediately. Unclosed/invalid pieces are skipped — the next
// chunk will try again.
export function tryExtractPartialFields(text: string): PartialField[] {
  const fields: PartialField[] = [];

  for (const { key, label } of FIELD_MAP) {
    const idx = text.indexOf(key);
    if (idx === -1) {
      continue;
    }

    const afterColon = text.indexOf(":", idx + key.length);
    if (afterColon === -1) {
      continue;
    }

    const rest = text.slice(afterColon + 1).trimStart();
    if (!rest) {
      continue;
    }

    if (rest.startsWith('"')) {
      const endQuote = rest.indexOf('"', 1);
      if (endQuote > 1) {
        const value = rest.slice(1, endQuote);
        if (value && value !== "未发现信息") {
          fields.push({ label, value });
        }
      }
    } else if (LEADING_DIGIT_RE.test(rest)) {
      const match = rest.match(LEADING_DIGITS_RE);
      if (match) {
        fields.push({ label, value: match[1] });
      }
    } else if (rest.startsWith("[")) {
      const endBracket = rest.indexOf("]");
      if (endBracket > 1) {
        try {
          const arr = JSON.parse(rest.slice(0, endBracket + 1)) as string[];
          if (arr.length > 0) {
            fields.push({ label, value: arr.slice(0, 5).join("、") });
          }
        } catch {
          /* partial array — ignore */
        }
      }
    }
  }

  return fields;
}
