import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Req,
  SerializeOptions,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { GlobalConfigInput } from "@arc/shared/global-config";
import {
  RequireWorkspacePermission,
  WorkspaceAccessGuard,
  getWorkspaceContext,
} from "../workspace-access.js";
import { workspaceSlugSchema } from "../departments/department.schemas.js";
import { GlobalConfigService } from "./global-config.service.js";
import { globalConfigResponseSchema, globalConfigSchema } from "./global-config.schemas.js";
import type { z } from "zod";

type WorkspacePath = z.infer<typeof workspaceSlugSchema>;

@ApiTags("workspace-global-config")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/studio/global-config")
export class GlobalConfigController {
  constructor(@Inject(GlobalConfigService) private readonly config: GlobalConfigService) {}

  @Get()
  @ApiOperation({ operationId: "getWorkspaceGlobalConfig" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: globalConfigResponseSchema })
  @RequireWorkspacePermission("globalConfig", "read")
  get(@Req() request: Request, @Param({ schema: workspaceSlugSchema }) _path: WorkspacePath) {
    return this.config.get(getWorkspaceContext(request).workspace.id);
  }

  @Put()
  @ApiOperation({ operationId: "updateWorkspaceGlobalConfig" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: globalConfigResponseSchema })
  @RequireWorkspacePermission("globalConfig", "update")
  update(
    @Req() request: Request,
    @Param({ schema: workspaceSlugSchema }) _path: WorkspacePath,
    @Body({ schema: globalConfigSchema }) body: GlobalConfigInput,
  ) {
    const context = getWorkspaceContext(request);
    return this.config.update(context.workspace.id, context.actor.id, body);
  }
}
