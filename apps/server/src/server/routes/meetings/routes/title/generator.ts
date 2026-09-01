import { getMastraModelApiKey } from "@app/ai-runtime/models";
import { generateTextWithMastraAgent, titleAgent } from "@app/ai-runtime/simple-generators";

const MAX_TITLE_LENGTH = 28;
const TITLE_QUOTES_REGEX = /["'`“”‘’]/g;
const TITLE_TRAILING_PUNCTUATION_REGEX = /[。！？!?；;，,：:、]+$/g;
const TITLE_WHITESPACE_REGEX = /\s+/g;

interface RecordingTitlePrompt {
  maxOutputTokens: number;
  prompt: string;
  temperature: number;
}

export interface RecordingTitleDependencies {
  generateTitleText: (input: RecordingTitlePrompt) => Promise<string>;
  isModelConfigured: () => boolean;
}

const defaultDependencies: RecordingTitleDependencies = {
  generateTitleText: async (input) =>
    await generateTextWithMastraAgent({
      ...input,
      agent: titleAgent,
    }),
  isModelConfigured: () => Boolean(getMastraModelApiKey()),
};

export function sanitizeRecordingTitle(value: string): string {
  return value
    .replace(TITLE_QUOTES_REGEX, "")
    .replace(TITLE_WHITESPACE_REGEX, " ")
    .trim()
    .replace(TITLE_TRAILING_PUNCTUATION_REGEX, "")
    .slice(0, MAX_TITLE_LENGTH);
}

export async function generateRecordingTitle(
  transcript: string,
  dependencies: RecordingTitleDependencies = defaultDependencies,
): Promise<string> {
  if (!dependencies.isModelConfigured()) {
    throw new Error("标题生成模型尚未配置");
  }
  const generated = await dependencies.generateTitleText({
    // Reasoning models count hidden reasoning against this budget. A very small
    // limit can finish with only reasoning tokens and an empty visible title.
    maxOutputTokens: 256,
    prompt: `根据以下录制中的实时转写内容，总结一个简短、自然的中文标题。
要求：
- 只输出标题，不要解释
- 8 到 16 个字，最长不超过 28 字
- 概括当前对话最明确的核心主题、事项或人物动作
- 不照抄开头句，不堆砌关键词
- 不使用“录制记录”“会议讨论”“沟通交流”等空泛表述
- 信息尚少时，基于已有内容做保守概括，不虚构细节
- 不要标点结尾

实时转写：
${transcript}`,
    temperature: 0.2,
  });
  const title = sanitizeRecordingTitle(generated);
  if (!title) {
    throw new Error("标题生成结果为空");
  }
  return title;
}
