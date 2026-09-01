import type { CanActivate, ExecutionContext } from "@nestjs/common";
import {
  createParamDecorator,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { WORKSPACE_ACCESS_PORT } from "./workspace.ports.js";
import type {
  WorkspaceAccessPort,
  WorkspacePermission,
  WorkspaceRequestContext,
} from "./workspace.ports.js";

const WORKSPACE_PERMISSION = Symbol("WORKSPACE_PERMISSION");

export const RequireWorkspacePermission = (resource: string, action: string) =>
  SetMetadata(WORKSPACE_PERMISSION, { action, resource } satisfies WorkspacePermission);

export const RequireWorkspacePermissions = (...permissions: WorkspacePermission[]) =>
  SetMetadata(WORKSPACE_PERMISSION, permissions);

@Injectable()
export class WorkspaceAccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(WORKSPACE_ACCESS_PORT) private readonly access: WorkspaceAccessPort,
  ) {}

  async canActivate(executionContext: ExecutionContext): Promise<boolean> {
    const request = executionContext.switchToHttp().getRequest<Request>();
    const slugValue = request.params.slug;
    const slug = Array.isArray(slugValue) ? slugValue[0] : slugValue;
    const context = await this.access.resolve(request, slug);
    request.workspaceContext = context;

    const permission = this.reflector.getAllAndOverride<
      WorkspacePermission | WorkspacePermission[]
    >(WORKSPACE_PERMISSION, [executionContext.getHandler(), executionContext.getClass()]);
    let permissions: WorkspacePermission[] = [];
    if (permission) {
      permissions = Array.isArray(permission) ? permission : [permission];
    }
    const authorizationResults = await Promise.all(
      permissions.map((item) => this.access.authorize(context, item)),
    );
    if (permissions.length && !authorizationResults.every(Boolean)) {
      throw new ForbiddenException("Forbidden", { errorCode: "WORKSPACE_PERMISSION_DENIED" });
    }
    return true;
  }
}

export function getWorkspaceContext(request: Request): WorkspaceRequestContext {
  const context = request.workspaceContext;
  if (!context) {
    throw new ForbiddenException("Forbidden", { errorCode: "WORKSPACE_CONTEXT_MISSING" });
  }
  return context;
}

export const CurrentWorkspace = createParamDecorator(
  (_data: undefined, executionContext: ExecutionContext): WorkspaceRequestContext =>
    getWorkspaceContext(executionContext.switchToHttp().getRequest<Request>()),
);
