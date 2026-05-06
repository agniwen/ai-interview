import { z } from "zod";
import { renderProfileReport } from "@/lib/interview/report";
import { fileToUploadedResumePdf, parseResumeSubagent } from "@/server/agents/resume-parser-agent";
import { factory } from "@/server/factory";
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
//   - /v1/auth/device/approve   要求登录（authMiddleware 在 app.ts 上挂）
//   - /v1/auth/device/deny      要求登录（authMiddleware 在 app.ts 上挂）
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

export const skillRouter = factory
  .createApp()
  .post("/v1/auth/device/code", async (c) => {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = issueCodeBodySchema.safeParse(raw);
    const scope = parsed.success && parsed.data.scope ? parsed.data.scope : SCOPE_RESUME_PARSE;
    if (scope !== SCOPE_RESUME_PARSE) {
      return c.json({ error: `不支持的 scope：${scope}` }, 400);
    }
    const result = await issueDeviceCode(scope);
    return c.json(result);
  })
  .post("/v1/auth/device/token", async (c) => {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = pollTokenBodySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "device_code 不能为空。" }, 400);
    }
    const { body, status } = await pollDeviceCode(parsed.data.device_code);
    return c.json(body, status as 200 | 400);
  })
  .post("/v1/auth/device/approve", async (c) => {
    if (!c.var.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const raw = await c.req.json().catch(() => ({}));
    const parsed = approveBodySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "缺少 user_code。" }, 400);
    }
    const { body, status } = await approveDeviceCode(parsed.data.user_code, c.var.user.id);
    return c.json(body, status as 200 | 400 | 404 | 409 | 410);
  })
  .post("/v1/auth/device/deny", async (c) => {
    if (!c.var.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const raw = await c.req.json().catch(() => ({}));
    const parsed = approveBodySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "缺少 user_code。" }, 400);
    }
    const { body, status } = await denyDeviceCode(parsed.data.user_code);
    return c.json(body, status as 200 | 400 | 404 | 409);
  })
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
