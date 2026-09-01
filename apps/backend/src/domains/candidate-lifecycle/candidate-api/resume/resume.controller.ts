/* oxlint-disable class-methods-use-this -- The model catalog endpoint remains an instance controller method for Nest route discovery. */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Post,
  SerializeOptions,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { RESUME_UTILITY_PORT } from "./resume.port.js";
import type { ResumeUtilityPort } from "./resume.port.js";

const resumeTitleRequestSchema = z.object({
  hasFiles: z.boolean().optional(),
  text: z.string().trim().min(1).max(5000),
});
const resumeTitleResponseSchema = z.object({ title: z.string() });
const resumeModelsResponseSchema = z.object({
  defaultId: z.string(),
  models: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      provider: z.enum(["alibaba", "deepseek", "moonshot", "zhipu", "minimax", "other"]),
    }),
  ),
});

const LOCAL_CHAT_MODELS = [
  { id: "qwen3.6-plus", label: "Qwen3.6 Plus", provider: "alibaba" },
  { id: "qwen3.6-max-preview", label: "Qwen3.6 Max", provider: "alibaba" },
  { id: "qwen3.6-flash", label: "Qwen3.6 Flash", provider: "alibaba" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", provider: "deepseek" },
  {
    id: "deepseek-v4-flash-0731",
    label: "DeepSeek V4 Flash 0731",
    provider: "deepseek",
  },
  { id: "kimi-k2.6", label: "Kimi K2.6", provider: "moonshot" },
  { id: "glm-5.1", label: "GLM-5.1", provider: "zhipu" },
  { id: "glm-4.5-air", label: "GLM-4.5 Air", provider: "zhipu" },
  { id: "MiniMax-M2.7", label: "MiniMax M2.7", provider: "minimax" },
] as const;

function sanitizeTitle(title: string): string {
  return title
    .replaceAll(/["'`]/gu, "")
    .replaceAll(/[\r\n]+/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .slice(0, 28);
}

@ApiTags("resume")
@Controller("api/resume")
export class ResumeController {
  constructor(
    @Inject(RESUME_UTILITY_PORT)
    private readonly resumes: ResumeUtilityPort,
  ) {}

  @Get("models")
  @SerializeOptions({ schema: resumeModelsResponseSchema })
  @ApiOperation({ operationId: "listResumeChatModels" })
  @ApiResponse({ status: 200 })
  models() {
    return { defaultId: "qwen3.6-plus", models: LOCAL_CHAT_MODELS };
  }

  @Post("title")
  @HttpCode(200)
  @SerializeOptions({ schema: resumeTitleResponseSchema })
  @ApiOperation({ operationId: "generateResumeConversationTitle" })
  @ApiResponse({ status: 200 })
  async title(
    @Body({ schema: resumeTitleRequestSchema }) body: z.infer<typeof resumeTitleRequestSchema>,
  ) {
    try {
      const title = sanitizeTitle(
        await this.resumes.generateTitle({
          hasFiles: body.hasFiles ?? false,
          text: body.text,
        }),
      );
      return { title: title || "新对话" };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      return { title: "新对话" };
    }
  }
}
