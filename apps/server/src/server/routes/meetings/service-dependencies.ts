import {
  abortMeetingRecordingMultipartUpload,
  buildMeetingRecordingAssetKey,
  completeMeetingRecordingMultipartUpload,
  createMeetingRecordingMultipartUpload,
  headMeetingRecordingObject,
  listMeetingRecordingUploadParts,
  presignMeetingRecordingPutObject,
  presignMeetingRecordingUploadPart,
  presignRecordingGetObjectUrl,
} from "@app/object-storage";
import {
  enqueueMeetingPlaybackJobs,
  isMeetingProcessingQueueConfigured,
} from "@app/meeting-processing-queue/meeting-playback";
import {
  createOrLoadMeetingSession,
  isMeetingPurgeTombstoned,
  listMeetingSessionsForAccess,
  loadMeetingSession,
  markMeetingSessionVerified,
  meetingAcceptsUploadAuthorization,
  recordMeetingAssetMultipartUploadId,
  recordMeetingAudit,
  renameMeetingSession,
  renewMeetingDirectUploadLease,
} from "./dao";
import { loadAuthorizedMeeting } from "./authorized-meeting";
import type { MeetingGrantRole } from "@app/shared/meeting-recording";

export interface MeetingServiceAsset {
  contentType: string;
  durationMs: number;
  fragmentCount: number;
  id: string;
  meetingId: string;
  multipartParts?:
    | {
        md5Base64: string;
        offsetBytes: number;
        partNumber: number;
        sizeBytes: number;
      }[]
    | null;
  multipartUploadId?: string | null;
  sha256: string;
  sizeBytes: number;
  status: string;
  storageKey: string;
  track: string;
  uploadMode?: string;
}

export interface MeetingServiceUser {
  id: string;
  image: string | null;
  name: string;
}

export interface MeetingServiceSession {
  assets: MeetingServiceAsset[];
  id: string;
  manifestSha256: string;
  organizationId: string;
  ownerId: string;
  recoveryCopyDeleteAfter?: Date | null;
  status: string;
  startedAt?: Date;
  savedAt?: Date;
  title?: string;
  trashedFromStatus?: string | null;
  verifiedAt?: Date | null;
}

export interface MeetingAuthorizedAsset {
  durationMs?: number;
  status: string;
  storageKey: string;
  track: string;
}

export interface MeetingAuthorizedSession {
  accessGrantRole?: MeetingGrantRole | null;
  assets: MeetingAuthorizedAsset[];
  custodian?: MeetingServiceUser | null;
  custodianId?: string | null;
  id: string;
  manifestSha256?: string;
  organizationId?: string;
  owner?: MeetingServiceUser | null;
  ownerId: string;
  savedAt?: Date;
  startedAt?: Date;
  status: string;
  title?: string;
  trashedFromStatus?: string | null;
  verifiedAt?: Date | null;
  visibility: string;
  workspaceCustodied?: boolean;
}

export interface MeetingLibraryRow {
  controllerId: string;
  creatorId: string;
  creatorImage: string | null;
  creatorName: string;
  durationMs: number;
  grantRole: string | null;
  id: string;
  recordingAvailable: boolean;
  savedAt: Date;
  status: string;
  title: string;
  visibility: string;
  workspaceCustodied: boolean;
}

export interface MeetingObjectHead {
  checksumSha256: string | null;
  contentLength: number;
  contentType: string;
  etag?: string | null;
  sha256: string | null;
}

interface MeetingCreateResult {
  blockedByCapacity?: boolean;
  blockedByPurge?: boolean;
  created: boolean;
  meeting: MeetingServiceSession | undefined;
}

export interface MeetingServiceDependencies {
  abortMeetingRecordingMultipartUpload: typeof abortMeetingRecordingMultipartUpload;
  buildMeetingRecordingAssetKey: typeof buildMeetingRecordingAssetKey;
  completeMeetingRecordingMultipartUpload: typeof completeMeetingRecordingMultipartUpload;
  createMeetingRecordingMultipartUpload: typeof createMeetingRecordingMultipartUpload;
  createOrLoadMeetingSession: (
    ...args: Parameters<typeof createOrLoadMeetingSession>
  ) => Promise<MeetingCreateResult>;
  enqueueMeetingPlaybackJobs: typeof enqueueMeetingPlaybackJobs;
  headMeetingRecordingObject: (storageKey: string) => Promise<MeetingObjectHead | null>;
  isMeetingProcessingQueueConfigured: typeof isMeetingProcessingQueueConfigured;
  isMeetingPurgeTombstoned: typeof isMeetingPurgeTombstoned;
  listMeetingRecordingUploadParts: typeof listMeetingRecordingUploadParts;
  listMeetingSessionsForAccess: (
    ...args: Parameters<typeof listMeetingSessionsForAccess>
  ) => Promise<MeetingLibraryRow[]>;
  loadAuthorized: (
    ...args: Parameters<typeof loadAuthorizedMeeting>
  ) => Promise<MeetingAuthorizedSession | null>;
  loadMeetingSession: (id: string) => Promise<MeetingServiceSession | undefined>;
  markMeetingSessionVerified: typeof markMeetingSessionVerified;
  meetingAcceptsUploadAuthorization: typeof meetingAcceptsUploadAuthorization;
  presignMeetingRecordingPutObject: typeof presignMeetingRecordingPutObject;
  presignMeetingRecordingUploadPart: typeof presignMeetingRecordingUploadPart;
  presignRecordingGetObjectUrl: typeof presignRecordingGetObjectUrl;
  recordMeetingAssetMultipartUploadId: typeof recordMeetingAssetMultipartUploadId;
  recordMeetingAudit: typeof recordMeetingAudit;
  renameMeetingSession: typeof renameMeetingSession;
  renewMeetingDirectUploadLease: typeof renewMeetingDirectUploadLease;
}

export const defaultMeetingServiceDependencies: MeetingServiceDependencies = {
  abortMeetingRecordingMultipartUpload,
  buildMeetingRecordingAssetKey,
  completeMeetingRecordingMultipartUpload,
  createMeetingRecordingMultipartUpload,
  createOrLoadMeetingSession,
  enqueueMeetingPlaybackJobs,
  headMeetingRecordingObject,
  isMeetingProcessingQueueConfigured,
  isMeetingPurgeTombstoned,
  listMeetingRecordingUploadParts,
  listMeetingSessionsForAccess,
  loadAuthorized: loadAuthorizedMeeting,
  loadMeetingSession,
  markMeetingSessionVerified,
  meetingAcceptsUploadAuthorization,
  presignMeetingRecordingPutObject,
  presignMeetingRecordingUploadPart,
  presignRecordingGetObjectUrl,
  recordMeetingAssetMultipartUploadId,
  recordMeetingAudit,
  renameMeetingSession,
  renewMeetingDirectUploadLease,
};
