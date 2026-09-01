import { Module } from "@nestjs/common";
import { WORKSPACE_AUTHORIZATION_QUERIES } from "../../../domains/identity-access/workspace-authorization/workspace-authorization.queries.js";
import { DatabaseModule } from "../../database/database.module.js";
import { WorkspaceAccessAdapter } from "./workspace-access.adapter.js";
import { WorkspaceAccessGuard } from "./workspace-access.js";
import { WORKSPACE_ACCESS_PORT } from "./workspace-access.port.js";

@Module({
  exports: [WORKSPACE_ACCESS_PORT, WORKSPACE_AUTHORIZATION_QUERIES, WorkspaceAccessGuard],
  imports: [DatabaseModule],
  providers: [
    WorkspaceAccessAdapter,
    { provide: WORKSPACE_ACCESS_PORT, useExisting: WorkspaceAccessAdapter },
    { provide: WORKSPACE_AUTHORIZATION_QUERIES, useExisting: WorkspaceAccessAdapter },
    WorkspaceAccessGuard,
  ],
})
export class WorkspaceAccessHttpModule {}
