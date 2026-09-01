/* oxlint-disable typescript/consistent-type-imports -- Injected service classes must remain runtime imports so Nest can emit and resolve constructor metadata. */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  SerializeOptions,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { z } from "zod";
import {
  RequireWorkspacePermission,
  RequireWorkspacePermissions,
  WorkspaceAccessGuard,
  getWorkspaceContext,
} from "../../../infrastructure/http/workspace-access/index.js";
import { JobDescriptionService } from "./job-description.service.js";
import {
  generatedJobCodeSchema,
  jobDescriptionAiGenerateInputSchema,
  jobDescriptionAiGenerateResponseSchema,
  jobDescriptionAllResponseSchema,
  jobDescriptionDeleteSchema,
  jobDescriptionListQuerySchema,
  jobDescriptionListResponseSchema,
  jobDescriptionOperationalSchema,
  jobDescriptionPathSchema,
  jobDescriptionRecordSchema,
  jobDescriptionRecommendationsInputSchema,
  jobDescriptionRecommendationsResponseSchema,
  jobDescriptionSaveSchema,
  jobDescriptionScreeningPolicyInputSchema,
  jobDescriptionScreeningPolicyResponseSchema,
  jobDescriptionWorkspacePathSchema,
  referralLinkSchema,
} from "./job-description.schemas.js";

type WorkspacePath = z.infer<typeof jobDescriptionWorkspacePathSchema>;
type ItemPath = z.infer<typeof jobDescriptionPathSchema>;
type ListQuery = z.infer<typeof jobDescriptionListQuerySchema>;
type SaveInput = z.infer<typeof jobDescriptionSaveSchema>;
type OperationalInput = z.infer<typeof jobDescriptionOperationalSchema>;
type AiGenerateInput = z.infer<typeof jobDescriptionAiGenerateInputSchema>;
type ScreeningPolicyInput = z.infer<typeof jobDescriptionScreeningPolicyInputSchema>;
type RecommendationsInput = z.infer<typeof jobDescriptionRecommendationsInputSchema>;

@ApiTags("workspace-job-descriptions")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/studio/job-descriptions")
export class JobDescriptionController {
  constructor(private readonly jobs: JobDescriptionService) {}

  @Post("ai-generate")
  @HttpCode(200)
  @ApiOperation({ operationId: "generateWorkspaceJobDescriptionDraft" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: jobDescriptionAiGenerateResponseSchema })
  @RequireWorkspacePermission("jd", "update")
  aiGenerate(
    @Param({ schema: jobDescriptionWorkspacePathSchema }) _path: WorkspacePath,
    @Body({ schema: jobDescriptionAiGenerateInputSchema }) body: AiGenerateInput,
  ) {
    return this.jobs.aiGenerate(body);
  }

  @Post("generate-screening-policy")
  @HttpCode(200)
  @ApiOperation({ operationId: "generateWorkspaceJobDescriptionScreeningPolicy" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: jobDescriptionScreeningPolicyResponseSchema })
  @RequireWorkspacePermission("jd", "update")
  generateScreeningPolicy(
    @Param({ schema: jobDescriptionWorkspacePathSchema }) _path: WorkspacePath,
    @Body({ schema: jobDescriptionScreeningPolicyInputSchema }) body: ScreeningPolicyInput,
  ) {
    return this.jobs.generateScreeningPolicy(body);
  }

  @Get()
  @ApiOperation({ operationId: "listWorkspaceJobDescriptions" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: jobDescriptionListResponseSchema })
  @RequireWorkspacePermission("jd", "read")
  list(
    @Req() request: Request,
    @Param({ schema: jobDescriptionWorkspacePathSchema }) _path: WorkspacePath,
    @Query({ schema: jobDescriptionListQuerySchema }) query: ListQuery,
  ) {
    return this.jobs.list(getWorkspaceContext(request).workspace.id, query);
  }

  @Get("all")
  @ApiOperation({ operationId: "listAllWorkspaceJobDescriptions" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: jobDescriptionAllResponseSchema })
  @RequireWorkspacePermission("jd", "read")
  listAll(
    @Req() request: Request,
    @Param({ schema: jobDescriptionWorkspacePathSchema }) _path: WorkspacePath,
  ) {
    return this.jobs.listAll(getWorkspaceContext(request).workspace.id);
  }

  @Get("recruiting")
  @ApiOperation({ operationId: "listRecruitingWorkspaceJobDescriptions" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: jobDescriptionAllResponseSchema })
  @RequireWorkspacePermission("jd", "read")
  listRecruiting(
    @Req() request: Request,
    @Param({ schema: jobDescriptionWorkspacePathSchema }) _path: WorkspacePath,
  ) {
    return this.jobs.listRecruiting(getWorkspaceContext(request).workspace.id);
  }

  @Post("generate-code")
  @HttpCode(200)
  @ApiOperation({ operationId: "generateWorkspaceJobDescriptionCode" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: generatedJobCodeSchema })
  @RequireWorkspacePermission("jd", "read")
  generateCode(
    @Req() request: Request,
    @Param({ schema: jobDescriptionWorkspacePathSchema }) _path: WorkspacePath,
  ) {
    return this.jobs.generateCode(getWorkspaceContext(request).workspace.id);
  }

  @Post()
  @ApiOperation({ operationId: "createWorkspaceJobDescription" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: jobDescriptionRecordSchema })
  @RequireWorkspacePermission("jd", "create")
  create(
    @Req() request: Request,
    @Param({ schema: jobDescriptionWorkspacePathSchema }) _path: WorkspacePath,
    @Body({ schema: jobDescriptionSaveSchema }) body: SaveInput,
  ) {
    const context = getWorkspaceContext(request);
    return this.jobs.create(context.workspace.id, context.actor.id, body);
  }

  @Patch(":id/operational")
  @ApiOperation({ operationId: "updateWorkspaceJobDescriptionOperationalAssignment" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: jobDescriptionRecordSchema })
  @RequireWorkspacePermission("jd", "update")
  operational(
    @Req() request: Request,
    @Param({ schema: jobDescriptionPathSchema }) path: ItemPath,
    @Body({ schema: jobDescriptionOperationalSchema }) body: OperationalInput,
  ) {
    return this.jobs.operational(getWorkspaceContext(request).workspace.id, path.id, body);
  }

  @Post(":id/referral-link")
  @ApiOperation({ operationId: "createWorkspaceJobDescriptionReferralLink" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: referralLinkSchema })
  @RequireWorkspacePermission("jd", "read")
  referralLink(
    @Req() request: Request,
    @Param({ schema: jobDescriptionPathSchema }) path: ItemPath,
  ) {
    const context = getWorkspaceContext(request);
    const origin = `${request.protocol}://${request.get("host")}`;
    return this.jobs.referralLink(context.workspace.id, context.actor.id, path.id, origin);
  }

  @Post(":id/recommendations")
  @HttpCode(200)
  @ApiOperation({ operationId: "recommendWorkspaceJobDescriptionCandidates" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: jobDescriptionRecommendationsResponseSchema })
  @RequireWorkspacePermissions(
    { action: "read", resource: "jd" },
    { action: "read", resource: "resumeLibrary" },
  )
  recommendations(
    @Req() request: Request,
    @Param({ schema: jobDescriptionPathSchema }) path: ItemPath,
    @Body({ schema: jobDescriptionRecommendationsInputSchema }) body: RecommendationsInput,
  ) {
    return this.jobs.recommendations(getWorkspaceContext(request).workspace.id, path.id, body);
  }

  @Get(":id")
  @ApiOperation({ operationId: "getWorkspaceJobDescription" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: jobDescriptionRecordSchema })
  @RequireWorkspacePermission("jd", "read")
  get(@Req() request: Request, @Param({ schema: jobDescriptionPathSchema }) path: ItemPath) {
    return this.jobs.get(getWorkspaceContext(request).workspace.id, path.id);
  }

  @Patch(":id")
  @ApiOperation({ operationId: "updateWorkspaceJobDescription" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: jobDescriptionRecordSchema })
  @RequireWorkspacePermission("jd", "update")
  update(
    @Req() request: Request,
    @Param({ schema: jobDescriptionPathSchema }) path: ItemPath,
    @Body({ schema: jobDescriptionSaveSchema }) body: SaveInput,
  ) {
    const context = getWorkspaceContext(request);
    return this.jobs.update(context.workspace.id, context.actor.id, path.id, body);
  }

  @Delete(":id")
  @HttpCode(200)
  @ApiOperation({ operationId: "deleteWorkspaceJobDescription" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: jobDescriptionDeleteSchema })
  @RequireWorkspacePermission("jd", "delete")
  remove(@Req() request: Request, @Param({ schema: jobDescriptionPathSchema }) path: ItemPath) {
    return this.jobs.remove(getWorkspaceContext(request).workspace.id, path.id);
  }
}
