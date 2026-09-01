import type { Request } from "express";
import type { Readable } from "node:stream";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { Database } from "../../infrastructure/database/database.tokens.js";

export const WORKSPACE_DATABASE_PORT = Symbol("WORKSPACE_DATABASE_PORT");
export const WORKSPACE_ACCESS_PORT = Symbol("WORKSPACE_ACCESS_PORT");
export const WORKSPACE_OBJECT_STORAGE_PORT = Symbol("WORKSPACE_OBJECT_STORAGE_PORT");
export const WORKSPACE_RESUME_SEMANTIC_PORT = Symbol("WORKSPACE_RESUME_SEMANTIC_PORT");
export const WORKSPACE_RESUME_QUEUE_PORT = Symbol("WORKSPACE_RESUME_QUEUE_PORT");
export const WORKSPACE_DOCUMENT_PREVIEW_PORT = Symbol("WORKSPACE_DOCUMENT_PREVIEW_PORT");

export type WorkspaceDatabasePort = Database;

export interface WorkspaceActor {
  id: string;
  email?: string;
  name?: string | null;
}

export interface WorkspaceMemberContext {
  id: string;
  organizationId: string;
  role: string;
  userId: string;
}

export interface WorkspaceOrganizationContext {
  id: string;
  logo: string | null;
  metadata: string | null;
  name: string;
  slug: string;
}

export interface WorkspaceRequestContext {
  actor: WorkspaceActor;
  member: WorkspaceMemberContext;
  workspace: WorkspaceOrganizationContext;
}

export interface WorkspacePermission {
  action: string;
  resource: string;
}

export interface WorkspaceAccessPort {
  authorize(context: WorkspaceRequestContext, permission: WorkspacePermission): Promise<boolean>;
  resolve(request: Request, slug: string): Promise<WorkspaceRequestContext>;
}

export interface WorkspaceObjectStoragePort {
  getBytes(key: string): Promise<{
    bytes: Uint8Array;
    contentType?: string;
  } | null>;
  getStream(key: string): Promise<{
    body: Readable;
    contentLength?: number;
    contentType?: string;
  } | null>;
  presignGet(key: string, expiresInSeconds: number): Promise<string>;
  buildMeetingRecordingKey(input: {
    meetingId: string;
    organizationId: string;
    track: "microphone" | "system";
  }): Promise<string>;
  abortMeetingMultipart(input: { key: string; uploadId: string }): Promise<void>;
  completeMeetingMultipart(input: {
    key: string;
    parts: { etag: string; partNumber: number }[];
    uploadId: string;
  }): Promise<void>;
  createMeetingMultipart(input: {
    contentType: string;
    key: string;
    sha256: string;
  }): Promise<string>;
  headMeetingObject(key: string): Promise<{
    checksumSha256: string | null;
    contentLength: number;
    contentType: string;
    etag: string | null;
    sha256: string | null;
  } | null>;
  listMeetingMultipartParts(input: {
    key: string;
    uploadId: string;
  }): Promise<{ etag: string; partNumber: number; sizeBytes: number }[]>;
  presignMeetingPart(input: {
    key: string;
    md5Base64: string;
    partNumber: number;
    sizeBytes: number;
    uploadId: string;
  }): Promise<{ expiresAt: Date; headers: Record<string, string>; url: string }>;
  presignMeetingPut(input: {
    contentType: string;
    key: string;
    sha256: string;
    sizeBytes: number;
  }): Promise<{ expiresAt: Date; headers: Record<string, string>; url: string }>;
  presignMeetingGet(key: string, expiresInSeconds: number): Promise<string>;
}

export interface WorkspaceDocumentPreviewPort {
  pptxToPdf(input: { bytes: Uint8Array; filename: string }): Promise<Uint8Array>;
}

export interface WorkspaceResumeSemanticPort {
  findDuplicates(input: {
    email?: string | null;
    name?: string | null;
    organizationId: string;
    phone?: string | null;
    resumeProfile?: ResumeProfile | null;
  }): Promise<unknown[]>;
}

export interface WorkspaceResumeQueuePort {
  forceReparse(input: {
    organizationId: string;
    requestedBy: string;
    resumeRecordId: string;
  }): Promise<"busy" | "missing" | "no_file" | "queue_unavailable" | "queued">;
  retryParse(input: {
    organizationId: string;
    requestedBy: string;
    resumeRecordId: string;
  }): Promise<"busy" | "missing" | "queue_unavailable" | "queued">;
}

declare module "express" {
  interface Request {
    workspaceContext?: WorkspaceRequestContext;
  }
}
