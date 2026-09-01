import { Module } from "@nestjs/common";
import { BackgroundQueueModule } from "../../background/background-queue.module.js";
import { BackendConfigModule } from "../../config/backend-config.module.js";
import {
  WORKSPACE_DATABASE_PORT,
  WORKSPACE_DOCUMENT_PREVIEW_PORT,
  WORKSPACE_OBJECT_STORAGE_PORT,
  WORKSPACE_RESUME_SEMANTIC_PORT,
  WORKSPACE_RESUME_QUEUE_PORT,
} from "./workspace.ports.js";
import { API_DATABASE } from "../database/database.tokens.js";
import { DatabaseModule } from "../database/database.module.js";
import { WorkspaceObjectStorageAdapter } from "./workspace-object-storage.adapter.js";
import { WorkspaceResumeSemanticAdapter } from "./workspace-semantic.adapter.js";
import { WorkspaceDocumentPreviewAdapter } from "./workspace-document-preview.adapter.js";
import { WorkspaceResumeQueueAdapter } from "../../domains/candidate-lifecycle/workloads/infrastructure/workspace-resume-queue.adapter.js";

@Module({
  exports: [
    WORKSPACE_DATABASE_PORT,
    WORKSPACE_DOCUMENT_PREVIEW_PORT,
    WORKSPACE_OBJECT_STORAGE_PORT,
    WORKSPACE_RESUME_QUEUE_PORT,
    WORKSPACE_RESUME_SEMANTIC_PORT,
  ],
  imports: [BackendConfigModule, BackgroundQueueModule, DatabaseModule],
  providers: [
    { provide: WORKSPACE_DATABASE_PORT, useExisting: API_DATABASE },
    { provide: WORKSPACE_DOCUMENT_PREVIEW_PORT, useClass: WorkspaceDocumentPreviewAdapter },
    { provide: WORKSPACE_OBJECT_STORAGE_PORT, useClass: WorkspaceObjectStorageAdapter },
    { provide: WORKSPACE_RESUME_QUEUE_PORT, useClass: WorkspaceResumeQueueAdapter },
    { provide: WORKSPACE_RESUME_SEMANTIC_PORT, useClass: WorkspaceResumeSemanticAdapter },
  ],
})
export class WorkspaceInfrastructureModule {}
