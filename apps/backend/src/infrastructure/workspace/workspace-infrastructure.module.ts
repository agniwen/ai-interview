import { Module } from "@nestjs/common";
import {
  WORKSPACE_ACCESS_PORT,
  WORKSPACE_DATABASE_PORT,
  WORKSPACE_DOCUMENT_PREVIEW_PORT,
  WORKSPACE_OBJECT_STORAGE_PORT,
  WORKSPACE_RESUME_SEMANTIC_PORT,
  WORKSPACE_RESUME_QUEUE_PORT,
} from "../../features/workspace/workspace.ports.js";
import { API_DATABASE } from "../database/database.tokens.js";
import { WorkspaceAccessAdapter } from "./workspace-access.adapter.js";
import { WorkspaceObjectStorageAdapter } from "./workspace-object-storage.adapter.js";
import { WorkspaceResumeSemanticAdapter } from "./workspace-semantic.adapter.js";
import { WorkspaceDocumentPreviewAdapter } from "./workspace-document-preview.adapter.js";
import { WorkspaceResumeQueueAdapter } from "./workspace-resume-queue.adapter.js";

@Module({
  exports: [
    WORKSPACE_ACCESS_PORT,
    WORKSPACE_DATABASE_PORT,
    WORKSPACE_DOCUMENT_PREVIEW_PORT,
    WORKSPACE_OBJECT_STORAGE_PORT,
    WORKSPACE_RESUME_QUEUE_PORT,
    WORKSPACE_RESUME_SEMANTIC_PORT,
  ],
  providers: [
    { provide: WORKSPACE_DATABASE_PORT, useExisting: API_DATABASE },
    { provide: WORKSPACE_ACCESS_PORT, useClass: WorkspaceAccessAdapter },
    { provide: WORKSPACE_DOCUMENT_PREVIEW_PORT, useClass: WorkspaceDocumentPreviewAdapter },
    { provide: WORKSPACE_OBJECT_STORAGE_PORT, useClass: WorkspaceObjectStorageAdapter },
    { provide: WORKSPACE_RESUME_QUEUE_PORT, useClass: WorkspaceResumeQueueAdapter },
    { provide: WORKSPACE_RESUME_SEMANTIC_PORT, useClass: WorkspaceResumeSemanticAdapter },
  ],
})
export class WorkspaceInfrastructureModule {}
