import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { renderProfileReport } from "@/lib/interview/report";
import { fileToUploadedResumePdf, parseResumeSubagent } from "@/server/agents/resume-parser-agent";
import { factory } from "@/server/factory";
import { authMiddleware } from "@/server/middlewares/auth";
import {
  approveDeviceCode,
  denyDeviceCode,
  issueDeviceCode,
  pollDeviceCode,
  rateLimitPerToken,
  requireSkillToken,
} from "./auth";

// =====================================================================
// Skill 对外 API。挂载点 /api/skill/*。
// 鉴权策略：
//   - /v1/auth/device/code      公开（设备发起授权流）
//   - /v1/auth/device/token     公开（设备轮询取 token）
//   - /v1/auth/device/approve   要求登录（authMiddleware 直接绑在 handler 上）
//   - /v1/auth/device/deny      要求登录（authMiddleware 直接绑在 handler 上）
//   - /v1/parse-resume          Bearer token (scope=resume:parse) + 限流
// =====================================================================

const SCOPE_RESUME_PARSE = "resume:parse" as const;
// 20MB 上限 / hard cap on inbound PDF size
const MAX_PDF_BYTES = 20 * 1024 * 1024;

const issueCodeBodySchema = z.object({
  scope: z.string().optional(),
});

const pollTokenBodySchema = z.object({
  device_code: z.string().min(1),
});

const approveBodySchema = z.object({
  user_code: z.string().min(1),
});

// 中文：通用 zValidator 错误响应钩子，保留 { error: string } 形状以匹配现网客户端期望。
// English: Shared zValidator error hook that preserves { error: string } shape
// for current callers.
interface ZodValidationResult {
  success: false;
  error: { issues: { message: string }[] };
}
function jsonValidatorError(fallback: string) {
  return (
    result: { success: true } | ZodValidationResult,
    c: { json: (body: unknown, status: 400) => Response },
  ) => {
    if (!result.success) {
      return c.json({ error: result.error.issues[0]?.message ?? fallback }, 400);
    }
  };
}

export const skillRouter = factory
  .createApp()
  .post(
    "/v1/auth/device/code",
    zValidator("json", issueCodeBodySchema, jsonValidatorError("请求体格式错误。")),
    async (c) => {
      const input = c.req.valid("json");
      const scope = input.scope ?? SCOPE_RESUME_PARSE;
      if (scope !== SCOPE_RESUME_PARSE) {
        return c.json({ error: `不支持的 scope：${scope}` }, 400);
      }
      const result = await issueDeviceCode(scope);
      return c.json(result, 200);
    },
  )
  .post(
    "/v1/auth/device/token",
    zValidator("json", pollTokenBodySchema, jsonValidatorError("device_code 不能为空。")),
    async (c) => {
      const input = c.req.valid("json");
      const { body, status } = await pollDeviceCode(input.device_code);
      return c.json(body, status as 200 | 400);
    },
  )
  .post(
    "/v1/auth/device/approve",
    authMiddleware,
    zValidator("json", approveBodySchema, jsonValidatorError("缺少 user_code。")),
    async (c) => {
      const input = c.req.valid("json");
      // authMiddleware 已保证 c.var.user 非空，仅做类型收窄。
      // authMiddleware guarantees c.var.user — this guard is just type-narrowing.
      const userId = c.var.user?.id;
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      const { body, status } = await approveDeviceCode(input.user_code, userId);
      return c.json(body, status as 200 | 400 | 404 | 409 | 410);
    },
  )
  .post(
    "/v1/auth/device/deny",
    authMiddleware,
    zValidator("json", approveBodySchema, jsonValidatorError("缺少 user_code。")),
    async (c) => {
      const input = c.req.valid("json");
      const { body, status } = await denyDeviceCode(input.user_code);
      return c.json(body, status as 200 | 400 | 404 | 409);
    },
  )
  .post(
    "/v1/parse-resume",
    requireSkillToken(SCOPE_RESUME_PARSE),
    rateLimitPerToken(),
    async (c) => {
      const formData = await c.req.formData().catch(() => null);
      if (!formData) {
        return c.json({ error: "请使用 multipart/form-data 上传简历。" }, 400);
      }
      const resume = formData.get("resume");
      if (!(resume instanceof File)) {
        return c.json({ error: "缺少简历 PDF 文件（字段名 resume）。" }, 400);
      }
      if (resume.size === 0) {
        return c.json({ error: "上传的 PDF 文件为空。" }, 400);
      }
      if (resume.size > MAX_PDF_BYTES) {
        return c.json({ error: "PDF 文件不能超过 20MB。" }, 413);
      }
      if (resume.type && resume.type !== "application/pdf") {
        return c.json({ error: "仅支持 PDF 格式。" }, 415);
      }

      try {
        const uploaded = await fileToUploadedResumePdf(resume);
        const result = await parseResumeSubagent(uploaded);
        const report = renderProfileReport(result);
        return c.json({
          filename: result.filename,
          pageCount: result.pageCount,
          report,
          structured: result.structured,
          textSource: result.textSource,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "简历解析失败。";
        const isClientError =
          message.includes("PDF") || message.includes("MB") || message.includes("简历");
        return c.json({ error: message, stage: "resume-parsing" }, isClientError ? 400 : 500);
      }
    },
  );
