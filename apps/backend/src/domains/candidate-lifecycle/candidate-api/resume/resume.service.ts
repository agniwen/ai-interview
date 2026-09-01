import { rawBackendEnvironment } from "../../../../config/raw-backend-environment.js";
import { Injectable, InternalServerErrorException } from "@nestjs/common";
import OpenAI from "openai";
import type { ResumeUtilityPort } from "./resume.port.js";

const DEFAULT_ALIBABA_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

@Injectable()
export class ResumeService implements ResumeUtilityPort {
  async generateTitle(input: { hasFiles: boolean; text: string }): Promise<string> {
    const apiKey = rawBackendEnvironment.ALIBABA_API_KEY?.trim();
    if (!apiKey) {
      throw new InternalServerErrorException("ALIBABA_API_KEY is not configured", {
        errorCode: "RESUME_TITLE_PROVIDER_NOT_CONFIGURED",
      });
    }
    const client = new OpenAI({
      apiKey,
      baseURL: rawBackendEnvironment.ALIBABA_BASE_URL?.trim() || DEFAULT_ALIBABA_BASE_URL,
    });
    const completion = await client.chat.completions.create({
      messages: [
        {
          content: "你是会话标题助手。根据用户第一条消息生成简洁、准确的中文标题，只输出标题。",
          role: "system",
        },
        {
          content: `要求：8 到 16 个字，最长不超过 28 字；不要解释和结尾标点；准确表达任务意图。hasFiles=${String(input.hasFiles)}\n用户消息：\n${input.text}`,
          role: "user",
        },
      ],
      model: rawBackendEnvironment.RESUME_TITLE_MODEL?.trim() || "qwen3.6-plus",
      temperature: 0.2,
    });
    return completion.choices[0]?.message.content ?? "";
  }
}
