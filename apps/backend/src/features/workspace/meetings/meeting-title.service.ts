import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import OpenAI from "openai";

const QUOTES = /["'`“”‘’]/g;
const TRAILING_PUNCTUATION = /[。！？!?；;，,：:、]+$/g;

export function sanitizeRecordingTitle(value: string) {
  return value
    .replace(QUOTES, "")
    .replaceAll(/\s+/g, " ")
    .trim()
    .replace(TRAILING_PUNCTUATION, "")
    .slice(0, 28);
}

@Injectable()
export class MeetingTitleService {
  async generate(transcript: string) {
    const apiKey = process.env.ALIBABA_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException("暂时无法生成录制标题", {
        errorCode: "MEETING_TITLE_UNAVAILABLE",
      });
    }
    const alibaba = Boolean(process.env.ALIBABA_API_KEY?.trim());
    try {
      const client = new OpenAI({
        apiKey,
        baseURL: alibaba
          ? process.env.ALIBABA_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1"
          : undefined,
      });
      const response = await client.chat.completions.create({
        max_tokens: 256,
        messages: [
          {
            content: `根据以下录制中的实时转写内容，总结一个简短、自然的中文标题。\n要求：\n- 只输出标题，不要解释\n- 8 到 16 个字，最长不超过 28 字\n- 概括当前对话最明确的核心主题、事项或人物动作\n- 不照抄开头句，不堆砌关键词\n- 不使用“录制记录”“会议讨论”“沟通交流”等空泛表述\n- 信息尚少时，基于已有内容做保守概括，不虚构细节\n- 不要标点结尾\n\n实时转写：\n${transcript}`,
            role: "user",
          },
        ],
        model:
          process.env.MEETING_TITLE_MODEL?.trim() ||
          process.env.MEETING_INTELLIGENCE_MODEL?.trim()?.split("/").at(-1) ||
          (alibaba ? "qwen-plus" : "gpt-5-mini"),
        temperature: 0.2,
      });
      const title = sanitizeRecordingTitle(response.choices[0]?.message.content ?? "");
      if (!title) {
        throw new Error("empty title");
      }
      return { title };
    } catch {
      throw new ServiceUnavailableException("暂时无法生成录制标题", {
        errorCode: "MEETING_TITLE_UNAVAILABLE",
      });
    }
  }
}
