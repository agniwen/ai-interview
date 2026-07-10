import { parseResumeFastToProfile } from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import { createInternalErrorResponse } from "@arc/ai-recruitment-copilot-backend/server/error-handler";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";

function isWorkspaceAdmin(role: string | null | undefined) {
  return role === "owner" || role === "admin";
}

export const agentDebugRouter = factory
  .createApp()
  .post("/resume-parser-test", requirePermission("globalConfig", "read"), async (c) => {
    if (!isWorkspaceAdmin(c.var.member?.role)) {
      return c.json({ message: "Forbidden" }, 403);
    }

    const formData = await c.req.formData();
    const resume = formData.get("resume");
    if (!(resume instanceof File)) {
      return c.json({ error: "缺少简历文件。" }, 400);
    }

    try {
      const parsed = await parseResumeFastToProfile(resume);
      return c.json(
        {
          fileName: resume.name,
          ocr: {
            pageCount: parsed.parsedPageCount,
            text: parsed.parsedText,
            textSource: parsed.parsedTextSource,
          },
          parsedStructured: parsed.parsedStructured,
          resumeProfile: parsed.resumeProfile,
        },
        200,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "简历解析失败。";
      if (message.includes("PDF") || message.includes("MB")) {
        return c.json({ error: message, stage: "agent-debug.resume-parser-test" }, 400);
      }
      return c.json(
        {
          ...createInternalErrorResponse({
            error,
            operation: "agent-debug-resume-parser-test",
            publicMessage: "简历解析失败。",
          }),
          stage: "agent-debug.resume-parser-test",
        },
        500,
      );
    }
  });
