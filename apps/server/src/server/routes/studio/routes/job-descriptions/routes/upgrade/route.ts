import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { factory, jsonValidatorError } from "../../../../../../factory";
import { requirePermission } from "../../../../../../middlewares/permission";
import { safeUpdateTag } from "../../../../../../cache-tags";
import { enqueueJobDescriptionIndexJobBestEffort } from "@server/lib/server/jd-semantic/enqueue";
import { BlueprintCompilationError } from "../../utils/evaluation-blueprint-compiler";
import { JobEvaluationLifecycleError } from "../../application/job-evaluation-lifecycle";
import { jobEvaluationUpgradeApplication } from "./application/default-job-evaluation-upgrade";
import { JobEvaluationUpgradeError } from "./application/job-evaluation-upgrade";
import type { JobEvaluationUpgradeDraft } from "./application/job-evaluation-upgrade";
import {
  discardUpgradeDraftSchema,
  publishUpgradeDraftSchema,
  updateUpgradeDraftSchema,
  upgradePreviewSchema,
  upgradeRuleDraftSchema,
} from "./schema";

function serializeDraft(draft: JobEvaluationUpgradeDraft) {
  return {
    ...draft,
    blueprintPreviewGeneratedAt: draft.blueprintPreviewGeneratedAt?.toISOString() ?? null,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

function upgradeErrorResponse(error: JobEvaluationUpgradeError) {
  return { code: error.code, error: error.message };
}

function upgradeErrorStatus(error: JobEvaluationUpgradeError): 404 | 409 {
  return error.code === "JOB_NOT_FOUND" || error.code === "UPGRADE_DRAFT_NOT_FOUND" ? 404 : 409;
}

export const jobEvaluationUpgradeRouter = factory
  .createApp()
  .post("/:id/upgrade", requirePermission("jd", "update"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    try {
      const draft = await jobEvaluationUpgradeApplication.createDraft({
        actorId: user.id,
        jobDescriptionId: c.req.param("id"),
        organizationId: activeOrg.id,
      });
      safeUpdateTag(`job-descriptions:${activeOrg.id}`);
      return c.json(serializeDraft(draft), 201);
    } catch (error) {
      if (error instanceof JobEvaluationUpgradeError) {
        return c.json(upgradeErrorResponse(error), upgradeErrorStatus(error));
      }
      throw error;
    }
  })
  .get("/:id/upgrade", requirePermission("jd", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    try {
      const draft = await jobEvaluationUpgradeApplication.getDraft({
        jobDescriptionId: c.req.param("id"),
        organizationId: activeOrg.id,
      });
      return c.json(serializeDraft(draft), 200);
    } catch (error) {
      if (error instanceof JobEvaluationUpgradeError) {
        return c.json(upgradeErrorResponse(error), upgradeErrorStatus(error));
      }
      throw error;
    }
  })
  .put(
    "/:id/upgrade",
    requirePermission("jd", "update"),
    zValidator("json", updateUpgradeDraftSchema, jsonValidatorError("升级草稿无效。")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      try {
        const draft = await jobEvaluationUpgradeApplication.updateDraft({
          ...c.req.valid("json"),
          actorId: user.id,
          jobDescriptionId: c.req.param("id"),
          organizationId: activeOrg.id,
        });
        safeUpdateTag(`job-descriptions:${activeOrg.id}`);
        return c.json(serializeDraft(draft), 200);
      } catch (error) {
        if (error instanceof JobEvaluationUpgradeError) {
          return c.json(upgradeErrorResponse(error), upgradeErrorStatus(error));
        }
        throw error;
      }
    },
  )
  .post(
    "/:id/upgrade/evaluation-blueprint-preview",
    requirePermission("jd", "update"),
    zValidator("json", upgradePreviewSchema, jsonValidatorError("预览参数无效。")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      try {
        const draft = await jobEvaluationUpgradeApplication.generatePreview({
          actorId: user.id,
          expectedVersion: c.req.valid("json").expectedVersion,
          jobDescriptionId: c.req.param("id"),
          organizationId: activeOrg.id,
        });
        return c.json(serializeDraft(draft), 200);
      } catch (error) {
        if (error instanceof BlueprintCompilationError || error instanceof z.ZodError) {
          return c.json({ error: error.message }, 422);
        }
        if (error instanceof JobEvaluationLifecycleError) {
          return c.json({ code: error.code, error: error.message }, 503);
        }
        if (error instanceof JobEvaluationUpgradeError) {
          return c.json(upgradeErrorResponse(error), upgradeErrorStatus(error));
        }
        throw error;
      }
    },
  )
  .put(
    "/:id/upgrade/evaluation-rule-draft",
    requirePermission("jd", "update"),
    zValidator("json", upgradeRuleDraftSchema, jsonValidatorError("评分规则无效。")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      try {
        const draft = await jobEvaluationUpgradeApplication.saveRuleDraft({
          ...c.req.valid("json"),
          actorId: user.id,
          jobDescriptionId: c.req.param("id"),
          organizationId: activeOrg.id,
        });
        return c.json(serializeDraft(draft), 200);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return c.json({ error: "评分规则无效。" }, 422);
        }
        if (error instanceof JobEvaluationUpgradeError) {
          return c.json(upgradeErrorResponse(error), upgradeErrorStatus(error));
        }
        throw error;
      }
    },
  )
  .delete(
    "/:id/upgrade",
    requirePermission("jd", "update"),
    zValidator("query", discardUpgradeDraftSchema, jsonValidatorError("草稿版本无效。")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      try {
        await jobEvaluationUpgradeApplication.discardDraft({
          actorId: user.id,
          expectedVersion: c.req.valid("query").expectedVersion,
          jobDescriptionId: c.req.param("id"),
          organizationId: activeOrg.id,
        });
        safeUpdateTag(`job-descriptions:${activeOrg.id}`);
        return c.json({ success: true }, 200);
      } catch (error) {
        if (error instanceof JobEvaluationUpgradeError) {
          return c.json(upgradeErrorResponse(error), upgradeErrorStatus(error));
        }
        throw error;
      }
    },
  )
  .post(
    "/:id/upgrade/publish",
    requirePermission("jd", "update"),
    zValidator("json", publishUpgradeDraftSchema, jsonValidatorError("发布参数无效。")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const id = c.req.param("id");
      try {
        const body = c.req.valid("json");
        const result = await jobEvaluationUpgradeApplication.publish({
          actorId: user.id,
          confirmedBlueprintHash: body.confirmedBlueprintHash,
          expectedVersion: body.expectedVersion,
          jobDescriptionId: id,
          organizationId: activeOrg.id,
        });
        console.info("[job-evaluation-upgrade] published", {
          actorId: user.id,
          draftVersion: body.expectedVersion,
          invalidatedLegacyAttemptCount: result.invalidatedLegacyAttemptCount,
          jobDescriptionId: id,
          organizationId: activeOrg.id,
        });
        await enqueueJobDescriptionIndexJobBestEffort({
          jobDescriptionId: id,
          organizationId: activeOrg.id,
        });
        safeUpdateTag(`job-descriptions:${activeOrg.id}`);
        return c.json(result, 200);
      } catch (error) {
        if (error instanceof JobEvaluationUpgradeError) {
          return c.json(upgradeErrorResponse(error), upgradeErrorStatus(error));
        }
        throw error;
      }
    },
  );
