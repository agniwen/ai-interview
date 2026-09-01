export const WORKLOAD_OBJECT_STORAGE = Symbol("WORKLOAD_OBJECT_STORAGE");

export interface StoredObjectMetadata {
  checksumSha256: string | null;
  contentLength: number;
  contentType: string;
  etag: string | null;
  sha256: string | null;
}

export interface WorkloadObjectStorage {
  abortMultipartUpload(input: { storageKey: string; uploadId: string }): Promise<void>;
  buildAttachmentKeyByHash(hash: string, extension: string): Promise<string>;
  buildPlaybackStorageKey(input: {
    meetingId: string;
    organizationId: string;
    processingRunId: string;
  }): Promise<string>;
  buildTranscriptionStagingKey(input: {
    index: number;
    meetingId: string;
    organizationId: string;
    stagingToken: string;
    track: string;
  }): string;
  delete(storageKey: string): Promise<void>;
  downloadToFile(input: { filePath: string; storageKey: string }): Promise<void>;
  getObjectBytes(storageKey: string): Promise<{
    bytes: Uint8Array;
    contentType: string;
  } | null>;
  head(storageKey: string): Promise<StoredObjectMetadata | null>;
  presignGet(storageKey: string, expiresIn: number): Promise<string>;
  putFile(input: {
    contentType: string;
    deadlineAt: Date;
    filePath: string;
    sha256: string;
    sizeBytes: number;
    storageKey: string;
  }): Promise<void>;
  putObjectBytes(input: {
    body: Uint8Array;
    contentType: string;
    storageKey: string;
  }): Promise<void>;
  verify(input: {
    contentType: string;
    sha256: string;
    sizeBytes: number;
    storageKey: string;
  }): Promise<boolean>;
}
