import { streamSSE } from "hono/streaming";

import { factory } from "../../../../../../factory";
import { requirePermission } from "../../../../../../middlewares/permission";
import { generateStructuredJobBlueprintPreview } from "../../application/default-job-evaluation-lifecycle";
import { JobEvaluationLifecycleError } from "../../application/job-evaluation-lifecycle";
import { BlueprintCompilationError } from "../../utils/evaluation-blueprint-compiler";

function previewFailure(error: Error) {
  if (error instanceof BlueprintCompilationError || error instanceof JobEvaluationLifecycleError) {
    return { code: error.code, message: error.message };
  }
  return { code: "JOB_BLUEPRINT_GENERATION_FAILED", message: "生成评分规则失败" };
}

export interface JobEvaluationPreviewStreamRouterDependencies {
  generateStructuredJobBlueprintPreview: typeof generateStructuredJobBlueprintPreview;
  requirePermission: typeof requirePermission;
}

const defaultDependencies: JobEvaluationPreviewStreamRouterDependencies = {
  generateStructuredJobBlueprintPreview,
  requirePermission,
};

export function createJobEvaluationPreviewStreamRouter(
  dependencies: JobEvaluationPreviewStreamRouterDependencies = defaultDependencies,
) {
  return factory
    .createApp()
    .post(
      "/:id/evaluation-blueprint-preview-stream",
      dependencies.requirePermission("jd", "update"),
      (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        return streamSSE(c, async (stream) => {
          try {
            const preview = await dependencies.generateStructuredJobBlueprintPreview(
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

            await stream.writeSSE({
              data: JSON.stringify({
                blueprint: preview.blueprint,
                blueprintHash: preview.blueprintHash,
                type: "preview.completed",
              }),
              event: "job-evaluation-preview",
            });
          } catch (error) {
            const failure = error instanceof Error ? error : new Error("生成评分规则失败");
            await stream.writeSSE({
              data: JSON.stringify({ error: previewFailure(failure), type: "preview.failed" }),
              event: "job-evaluation-preview",
            });
          }
        });
      },
    );
}

export const jobEvaluationPreviewStreamRouter = createJobEvaluationPreviewStreamRouter();
