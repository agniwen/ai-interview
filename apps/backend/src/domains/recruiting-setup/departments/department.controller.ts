import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
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
import {
  RequireWorkspacePermission,
  WorkspaceAccessGuard,
  getWorkspaceContext,
} from "../../../infrastructure/http/workspace-access/index.js";
import { DepartmentService } from "./department.service.js";
import {
  departmentAllResponseSchema,
  departmentFormSchema,
  departmentListQuerySchema,
  departmentListResponseSchema,
  departmentPathSchema,
  departmentSchema,
  departmentUpdateSchema,
  successResponseSchema,
} from "./department.schemas.js";
import { workspaceSlugSchema } from "../../../infrastructure/http/http.schemas.js";
import type { z } from "zod";

type DepartmentInput = z.infer<typeof departmentFormSchema>;
type DepartmentUpdate = z.infer<typeof departmentUpdateSchema>;
type DepartmentListQuery = z.infer<typeof departmentListQuerySchema>;
type DepartmentPath = z.infer<typeof departmentPathSchema>;
type WorkspacePath = z.infer<typeof workspaceSlugSchema>;

@ApiTags("workspace-departments")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/studio/departments")
export class DepartmentController {
  constructor(@Inject(DepartmentService) private readonly departments: DepartmentService) {}

  @Get()
  @ApiOperation({ operationId: "listWorkspaceDepartments" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: departmentListResponseSchema })
  @RequireWorkspacePermission("department", "read")
  list(
    @Req() request: Request,
    @Param({ schema: workspaceSlugSchema }) _path: WorkspacePath,
    @Query({ schema: departmentListQuerySchema }) query: DepartmentListQuery,
  ) {
    return this.departments.list(getWorkspaceContext(request).workspace.id, query);
  }

  @Get("all")
  @ApiOperation({ operationId: "listAllWorkspaceDepartments" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: departmentAllResponseSchema })
  @RequireWorkspacePermission("department", "read")
  listAll(@Req() request: Request, @Param({ schema: workspaceSlugSchema }) _path: WorkspacePath) {
    return this.departments.listAll(getWorkspaceContext(request).workspace.id);
  }

  @Post()
  @ApiOperation({ operationId: "createWorkspaceDepartment" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: departmentSchema })
  @RequireWorkspacePermission("department", "create")
  create(
    @Req() request: Request,
    @Param({ schema: workspaceSlugSchema }) _path: WorkspacePath,
    @Body({ schema: departmentFormSchema }) body: DepartmentInput,
  ) {
    const context = getWorkspaceContext(request);
    return this.departments.create(context.workspace.id, context.actor.id, body);
  }

  @Get(":id")
  @ApiOperation({ operationId: "getWorkspaceDepartment" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: departmentSchema })
  @RequireWorkspacePermission("department", "read")
  get(@Req() request: Request, @Param({ schema: departmentPathSchema }) path: DepartmentPath) {
    return this.departments.get(getWorkspaceContext(request).workspace.id, path.id);
  }

  @Patch(":id")
  @ApiOperation({ operationId: "updateWorkspaceDepartment" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: departmentSchema })
  @RequireWorkspacePermission("department", "update")
  update(
    @Req() request: Request,
    @Param({ schema: departmentPathSchema }) path: DepartmentPath,
    @Body({ schema: departmentUpdateSchema }) body: DepartmentUpdate,
  ) {
    return this.departments.update(getWorkspaceContext(request).workspace.id, path.id, body);
  }

  @Delete(":id")
  @HttpCode(200)
  @ApiOperation({ operationId: "deleteWorkspaceDepartment" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: successResponseSchema })
  @RequireWorkspacePermission("department", "delete")
  remove(@Req() request: Request, @Param({ schema: departmentPathSchema }) path: DepartmentPath) {
    return this.departments.remove(getWorkspaceContext(request).workspace.id, path.id);
  }
}
