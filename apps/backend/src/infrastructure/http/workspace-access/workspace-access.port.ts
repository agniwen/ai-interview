import type { Request } from "express";
import type {
  WorkspaceAuthorizationContext,
  WorkspaceAuthorizationQueries,
} from "../../../domains/identity-access/workspace-authorization/workspace-authorization.queries.js";

export const WORKSPACE_ACCESS_PORT = Symbol("WORKSPACE_ACCESS_PORT");

export interface WorkspaceAccessPort extends WorkspaceAuthorizationQueries {
  resolve(request: Request, slug: string): Promise<WorkspaceAuthorizationContext>;
}

declare module "express" {
  interface Request {
    workspaceContext?: WorkspaceAuthorizationContext;
  }
}
