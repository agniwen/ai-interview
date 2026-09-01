/* oxlint-disable typescript/consistent-type-imports -- Injected service classes must remain runtime imports so Nest can emit and resolve constructor metadata. */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  SerializeOptions,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import type { z } from "zod";
import {
  RequireWorkspacePermission,
  WorkspaceAccessGuard,
  getWorkspaceContext,
} from "../../../infrastructure/http/workspace-access/index.js";
import { JobEvaluationLifecycleService } from "./job-evaluation-lifecycle.service.js";
import {
  discardUpgradeDraftSchema,
  jobDescriptionDeleteSchema,
  jobDescriptionPathSchema,
  jobDescriptionRecordSchema,
  jobEvaluationPreviewSchema,
  publishStructuredJobSchema,
  publishUpgradeDraftSchema,
  publishUpgradeResponseSchema,
  saveEvaluationRuleDraftSchema,
  updateUpgradeDraftSchema,
  upgradeDraftSchema,
  upgradePreviewSchema,
  upgradeRuleDraftSchema,
} from "./job-description.schemas.js";
type Path = z.infer<typeof jobDescriptionPathSchema>;
type SaveRule = z.infer<typeof saveEvaluationRuleDraftSchema>;
type Publish = z.infer<typeof publishStructuredJobSchema>;
type UpdateUpgrade = z.infer<typeof updateUpgradeDraftSchema>;
type UpgradePreview = z.infer<typeof upgradePreviewSchema>;
type UpgradeRule = z.infer<typeof upgradeRuleDraftSchema>;
type Discard = z.infer<typeof discardUpgradeDraftSchema>;
type PublishUpgrade = z.infer<typeof publishUpgradeDraftSchema>;

@ApiTags("workspace-job-descriptions")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/studio/job-descriptions")
export class JobEvaluationLifecycleController {
  constructor(private readonly lifecycle: JobEvaluationLifecycleService) {}
  @Post(":id/evaluation-blueprint-preview")
  @HttpCode(200)
  @ApiOperation({ operationId: "generateWorkspaceJobEvaluationBlueprintPreview" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: jobEvaluationPreviewSchema })
  @RequireWorkspacePermission("jd", "update")
  preview(@Req() request: Request, @Param({ schema: jobDescriptionPathSchema }) path: Path) {
    const context = getWorkspaceContext(request);
    return this.lifecycle.preview(context.workspace.id, context.actor.id, path.id);
  }
  @Put(":id/evaluation-rule-draft")
  @ApiOperation({ operationId: "saveWorkspaceJobEvaluationRuleDraft" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: jobEvaluationPreviewSchema })
  @RequireWorkspacePermission("jd", "update")
  save(
    @Req() request: Request,
    @Param({ schema: jobDescriptionPathSchema }) path: Path,
    @Body({ schema: saveEvaluationRuleDraftSchema }) body: SaveRule,
  ) {
    const context = getWorkspaceContext(request);
    return this.lifecycle.saveRuleDraft(context.workspace.id, context.actor.id, path.id, body);
  }
  @Post(":id/publish")
  @HttpCode(200)
  @ApiOperation({ operationId: "publishWorkspaceStructuredJob" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: jobDescriptionRecordSchema })
  @RequireWorkspacePermission("jd", "update")
  publish(
    @Req() request: Request,
    @Param({ schema: jobDescriptionPathSchema }) path: Path,
    @Body({ schema: publishStructuredJobSchema }) body: Publish,
  ) {
    const context = getWorkspaceContext(request);
    return this.lifecycle.publish(
      context.workspace.id,
      context.actor.id,
      path.id,
      body.confirmedBlueprintHash,
    );
  }
  @Post(":id/upgrade")
  @ApiOperation({ operationId: "createWorkspaceJobEvaluationUpgrade" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: upgradeDraftSchema })
  @RequireWorkspacePermission("jd", "update")
  createUpgrade(@Req() request: Request, @Param({ schema: jobDescriptionPathSchema }) path: Path) {
    const context = getWorkspaceContext(request);
    return this.lifecycle.createUpgrade(context.workspace.id, context.actor.id, path.id);
  }
  @Get(":id/upgrade")
  @ApiOperation({ operationId: "getWorkspaceJobEvaluationUpgrade" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: upgradeDraftSchema })
  @RequireWorkspacePermission("jd", "read")
  getUpgrade(@Req() request: Request, @Param({ schema: jobDescriptionPathSchema }) path: Path) {
    return this.lifecycle.getUpgrade(getWorkspaceContext(request).workspace.id, path.id);
  }
  @Put(":id/upgrade")
  @ApiOperation({ operationId: "updateWorkspaceJobEvaluationUpgrade" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: upgradeDraftSchema })
  @RequireWorkspacePermission("jd", "update")
  updateUpgrade(
    @Req() request: Request,
    @Param({ schema: jobDescriptionPathSchema }) path: Path,
    @Body({ schema: updateUpgradeDraftSchema }) body: UpdateUpgrade,
  ) {
    const context = getWorkspaceContext(request);
    return this.lifecycle.updateUpgrade(context.workspace.id, context.actor.id, path.id, body);
  }
  @Post(":id/upgrade/evaluation-blueprint-preview")
  @HttpCode(200)
  @ApiOperation({ operationId: "generateWorkspaceJobEvaluationUpgradePreview" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: upgradeDraftSchema })
  @RequireWorkspacePermission("jd", "update")
  previewUpgrade(
    @Req() request: Request,
    @Param({ schema: jobDescriptionPathSchema }) path: Path,
    @Body({ schema: upgradePreviewSchema }) body: UpgradePreview,
  ) {
    const context = getWorkspaceContext(request);
    return this.lifecycle.previewUpgrade(
      context.workspace.id,
      context.actor.id,
      path.id,
      body.expectedVersion,
    );
  }
  @Put(":id/upgrade/evaluation-rule-draft")
  @ApiOperation({ operationId: "saveWorkspaceJobEvaluationUpgradeRuleDraft" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: upgradeDraftSchema })
  @RequireWorkspacePermission("jd", "update")
  saveUpgrade(
    @Req() request: Request,
    @Param({ schema: jobDescriptionPathSchema }) path: Path,
    @Body({ schema: upgradeRuleDraftSchema }) body: UpgradeRule,
  ) {
    const context = getWorkspaceContext(request);
    return this.lifecycle.saveUpgradeRuleDraft(
      context.workspace.id,
      context.actor.id,
      path.id,
      body,
    );
  }
  @Delete(":id/upgrade")
  @HttpCode(200)
  @ApiOperation({ operationId: "discardWorkspaceJobEvaluationUpgrade" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: jobDescriptionDeleteSchema })
  @RequireWorkspacePermission("jd", "update")
  discard(
    @Req() request: Request,
    @Param({ schema: jobDescriptionPathSchema }) path: Path,
    @Query({ schema: discardUpgradeDraftSchema }) query: Discard,
  ) {
    return this.lifecycle.discardUpgrade(
      getWorkspaceContext(request).workspace.id,
      path.id,
      query.expectedVersion,
    );
  }
  @Post(":id/upgrade/publish")
  @HttpCode(200)
  @ApiOperation({ operationId: "publishWorkspaceJobEvaluationUpgrade" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: publishUpgradeResponseSchema })
  @RequireWorkspacePermission("jd", "update")
  publishUpgrade(
    @Req() request: Request,
    @Param({ schema: jobDescriptionPathSchema }) path: Path,
    @Body({ schema: publishUpgradeDraftSchema }) body: PublishUpgrade,
  ) {
    const context = getWorkspaceContext(request);
    return this.lifecycle.publishUpgrade(
      context.workspace.id,
      context.actor.id,
      path.id,
      body.expectedVersion,
      body.confirmedBlueprintHash,
    );
  }
  @Post(":id/evaluation-blueprint-preview-stream")
  @HttpCode(200)
  @ApiOperation({ operationId: "streamWorkspaceJobEvaluationBlueprintPreview" })
  @ApiProduces("text/event-stream")
  @ApiResponse({ content: { "text/event-stream": { schema: { type: "string" } } }, status: 200 })
  @RequireWorkspacePermission("jd", "update")
  async stream(
    @Req() request: Request,
    @Res() response: Response,
    @Param({ schema: jobDescriptionPathSchema }) path: Path,
  ) {
    const context = getWorkspaceContext(request);
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.flushHeaders();
    try {
      const preview = await this.lifecycle.preview(context.workspace.id, context.actor.id, path.id);
      response.write(
        `event: job-evaluation-preview\ndata: ${JSON.stringify({ ruleDraft: this.lifecycle.toRuleDraft(preview.blueprint), type: "preview.partial" })}\n\n`,
      );
      response.write(
        `event: job-evaluation-preview\ndata: ${JSON.stringify({ blueprint: preview.blueprint, blueprintHash: preview.blueprintHash, type: "preview.completed" })}\n\n`,
      );
    } catch (error) {
      response.write(
        `event: job-evaluation-preview\ndata: ${JSON.stringify({ error: { code: "JOB_BLUEPRINT_GENERATION_FAILED", message: error instanceof Error ? error.message : "生成评分规则失败" }, type: "preview.failed" })}\n\n`,
      );
    } finally {
      response.end();
    }
  }
}
