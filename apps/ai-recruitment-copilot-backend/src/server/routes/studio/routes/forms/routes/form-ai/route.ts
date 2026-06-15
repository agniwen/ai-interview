import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import { searchCandidatesForFormAi } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/forms/dao/form-ai-context";
import { generateFormQuestionsFromPrompt } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/forms/utils/ai-form-questions-generate";
import {
  resolveAiGenerateContext,
  resolveInterviewRecordIds,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/forms/utils/resolve-ai-generate-context";

const generateFormQuestionsBodySchema = z.object({
  interviewRecordId: z.string().trim().min(1).optional(),
  interviewRecordIds: z.array(z.string().trim().min(1)).max(10).optional(),
  jobDescriptionId: z.string().trim().min(1).optional(),
  jobDescriptionIds: z.array(z.string().trim().min(1)).max(50).optional(),
  prompt: z.string().trim().min(1, "请填写 AI 填写指令").max(2000),
  templateDescription: z.string().trim().max(1000).optional(),
  templateTitle: z.string().trim().max(120).optional(),
});

export const candidateFormAiRouter = factory
  .createApp()
  .get(
    "/candidates/search",
    requirePermission("candidateForm", "read"),
    zValidator(
      "query",
      z.object({
        limit: z.coerce.number().int().min(1).max(50).optional(),
        search: z.string().optional(),
        templateId: z.string().trim().min(1).optional(),
      }),
      jsonValidatorError("查询参数无效。"),
    ),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const { search, templateId, limit } = c.req.valid("query");
      const records = await searchCandidatesForFormAi(activeOrg.id, {
        limit,
        search,
        templateId: templateId || undefined,
      });
      return c.json({ records }, 200);
    },
  )
  .post(
    "/ai-generate-questions",
    requirePermission("candidateForm", "update"),
    zValidator("json", generateFormQuestionsBodySchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }

      const body = c.req.valid("json");
      const { jobDescriptionId, jobDescriptionIds, prompt } = body;
      const interviewRecordIds = resolveInterviewRecordIds(body);
      const templateTitle = body.templateTitle?.trim() || "未命名面试表单";
      const templateDescription = body.templateDescription?.trim() || null;

      const resolved = await resolveAiGenerateContext(activeOrg.id, {
        interviewRecordIds,
        jobDescriptionId,
        jobDescriptionIds,
      });
      if ("error" in resolved) {
        return c.json({ error: resolved.error }, 400);
      }

      try {
        const questions = await generateFormQuestionsFromPrompt({
          candidates: resolved.candidates,
          hrPrompt: prompt,
          jobDescription: resolved.jobDescription,
          templateDescription,
          templateTitle,
        });
        return c.json({ questions }, 200);
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : "AI 生成失败。" }, 500);
      }
    },
  );
