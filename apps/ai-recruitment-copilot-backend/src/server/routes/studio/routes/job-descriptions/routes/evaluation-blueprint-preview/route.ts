import { streamSSE } from "hono/streaming";
import { safeUpdateTag } from "@arc/ai-recruitment-copilot-backend/server/cache-tags";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import {
  generateStructuredJobBlueprintPreview,
  JobEvaluationLifecycleError,
} from "../../application/job-evaluation-lifecycle";
import { BlueprintCompilationError } from "../../utils/evaluation-blueprint-compiler";

function previewFailure(error: unknown) {
  if (error instanceof BlueprintCompilationError || error instanceof JobEvaluationLifecycleError) {
    return { code: error.code, message: error.message };
  }
  return { code: "JOB_BLUEPRINT_GENERATION_FAILED", message: "生成评分规则失败" };
}

export const jobEvaluationPreviewStreamRouter = factory
  .createApp()
  .post("/:id/evaluation-blueprint-preview-stream", requirePermission("jd", "update"), (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    return streamSSE(c, async (stream) => {
      try {
        const preview = await generateStructuredJobBlueprintPreview(
          {
            actorId: user.id,
            jobDescriptionId: c.req.param("id"),
            organizationId: activeOrg.id,
          },
          {
            onProgress: async (ruleDraft) => {
              await stream.writeSSE({
                data: JSON.stringify({ ruleDraft, type: "preview.partial" }),
                event: "job-evaluation-preview",
              });
            },
          },
        );
        safeUpdateTag(`job-descriptions:${activeOrg.id}`);
        await stream.writeSSE({
          data: JSON.stringify({
            blueprint: preview.blueprint,
            blueprintHash: preview.blueprintHash,
            type: "preview.completed",
          }),
          event: "job-evaluation-preview",
        });
      } catch (error) {
        await stream.writeSSE({
          data: JSON.stringify({ error: previewFailure(error), type: "preview.failed" }),
          event: "job-evaluation-preview",
        });
      }
    });
  });
