import { z } from "zod";
import { meetingLiveTranscriptDraftSchema } from "@app/shared/meeting-transcription";
import { meetingLiveSummarySnapshotSchema } from "@app/shared/meeting-live-summary";
import type { MeetingLiveSummarySnapshot } from "@app/shared/meeting-live-summary";
import { makePaginationSchema } from "@app/shared/pagination";
import type { PaginatedResult } from "@app/shared/pagination";
export type {
  RecordingIdentity,
  TranscriptAttribution,
} from "@app/db-schema/human-interview-recording";

export const MEETING_SOURCE_TRACKS = ["microphone", "system"] as const;
export const MEETING_MULTIPART_PART_BYTES = 8 * 1024 * 1024;
export const MEETING_SINGLE_PUT_MAX_BYTES = 100 * 1024 * 1024;
export const SMALL_MEETING_TRACK_MAX_BYTES = MEETING_SINGLE_PUT_MAX_BYTES;
export const MEETING_TRACK_MAX_BYTES = 2_000_000_000;
export const MEETING_TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const RECORDING_TITLE_MAX_LENGTH = 80;

const sha256Schema = z.string().regex(/^[a-f\d]{64}$/i, "SHA-256 格式无效");
export const meetingSourceSegmentSchema = z.object({
  durationMs: z.number().int().nonnegative(),
  offsetBytes: z.number().int().nonnegative(),
  sizeBytes: z.number().int().positive(),
});

export const meetingSourceAssetSchema = z
  .object({
    contentType: z
      .string()
      .max(256)
      .refine((value) => value.startsWith("audio/"), "只接受音频 Content-Type"),
    durationMs: z.number().int().nonnegative(),
    fragmentCount: z.number().int().nonnegative(),
    segments: z.array(meetingSourceSegmentSchema).min(1).max(100).optional(),
    sha256: sha256Schema,
    sizeBytes: z.number().int().positive().max(MEETING_TRACK_MAX_BYTES),
    track: z.enum(MEETING_SOURCE_TRACKS),
  })
  .superRefine((asset, context) => {
    if (!asset.segments) {
      return;
    }
    let expectedOffset = 0;
    for (const [index, segment] of asset.segments.entries()) {
      if (segment.offsetBytes !== expectedOffset) {
        context.addIssue({
          code: "custom",
          message: "录音段必须连续覆盖音轨",
          path: ["segments", index],
        });
      }
      expectedOffset += segment.sizeBytes;
    }
    if (expectedOffset !== asset.sizeBytes) {
      context.addIssue({ code: "custom", message: "录音段未完整覆盖音轨", path: ["segments"] });
    }
  });

export const createSmallSavedMeetingSchema = z
  .object({
    assets: z.array(meetingSourceAssetSchema).length(2),
    id: z.string().uuid(),
    liveSummary: meetingLiveSummarySnapshotSchema.nullable().optional(),
    liveTranscriptDraft: meetingLiveTranscriptDraftSchema.nullable().optional(),
    manifestSha256: sha256Schema,
    savedAt: z.string().datetime({ offset: true }),
    startedAt: z.string().datetime({ offset: true }),
    title: z.string().trim().min(1).max(RECORDING_TITLE_MAX_LENGTH).optional(),
  })
  .superRefine((input, context) => {
    const tracks = new Set(input.assets.map((asset) => asset.track));
    for (const track of MEETING_SOURCE_TRACKS) {
      if (!tracks.has(track)) {
        context.addIssue({
          code: "custom",
          message: `缺少 ${track} 音轨`,
          path: ["assets"],
        });
      }
    }
    for (const [index, asset] of input.assets.entries()) {
      if (asset.sizeBytes > SMALL_MEETING_TRACK_MAX_BYTES) {
        context.addIssue({
          code: "too_big",
          maximum: SMALL_MEETING_TRACK_MAX_BYTES,
          origin: "number",
          path: ["assets", index, "sizeBytes"],
        });
      }
    }
  });

export const meetingMultipartPartSchema = z.object({
  md5Base64: z.string().regex(/^[A-Za-z\d+/]{22}==$/, "MD5 格式无效"),
  offsetBytes: z.number().int().nonnegative(),
  partNumber: z.number().int().positive().max(10_000),
  sizeBytes: z.number().int().positive().max(MEETING_MULTIPART_PART_BYTES),
});

export const multipartMeetingSourceAssetSchema = meetingSourceAssetSchema
  .extend({ parts: z.array(meetingMultipartPartSchema).min(1).max(10_000) })
  .superRefine((asset, context) => {
    let expectedOffset = 0;
    for (const [index, part] of asset.parts.entries()) {
      if (part.partNumber !== index + 1 || part.offsetBytes !== expectedOffset) {
        context.addIssue({
          code: "custom",
          message: "multipart parts 必须从 1 开始并连续覆盖音轨",
          path: ["parts", index],
        });
      }
      const isLast = index === asset.parts.length - 1;
      if (!isLast && part.sizeBytes !== MEETING_MULTIPART_PART_BYTES) {
        context.addIssue({
          code: "custom",
          message: "除最后一段外 multipart part 大小必须固定",
          path: ["parts", index, "sizeBytes"],
        });
      }
      expectedOffset += part.sizeBytes;
    }
    if (expectedOffset !== asset.sizeBytes) {
      context.addIssue({
        code: "custom",
        message: "multipart parts 未完整覆盖音轨",
        path: ["parts"],
      });
    }
  });

export const createMultipartSavedMeetingSchema = z
  .object({
    assets: z.array(multipartMeetingSourceAssetSchema).length(2),
    id: z.string().uuid(),
    liveSummary: meetingLiveSummarySnapshotSchema.nullable().optional(),
    liveTranscriptDraft: meetingLiveTranscriptDraftSchema.nullable().optional(),
    manifestSha256: sha256Schema,
    savedAt: z.string().datetime({ offset: true }),
    startedAt: z.string().datetime({ offset: true }),
    title: z.string().trim().min(1).max(RECORDING_TITLE_MAX_LENGTH).optional(),
  })
  .superRefine((input, context) => {
    const tracks = new Set(input.assets.map((asset) => asset.track));
    for (const track of MEETING_SOURCE_TRACKS) {
      if (!tracks.has(track)) {
        context.addIssue({ code: "custom", message: `缺少 ${track} 音轨`, path: ["assets"] });
      }
    }
  });

export const completeSmallSavedMeetingSchema = z.object({
  manifestSha256: sha256Schema,
});

export type CreateSmallSavedMeetingInput = z.infer<typeof createSmallSavedMeetingSchema>;
export type CreateMultipartSavedMeetingInput = z.infer<typeof createMultipartSavedMeetingSchema>;
export type MeetingSourceAssetInput = z.infer<typeof meetingSourceAssetSchema>;
export type MeetingSourceSegmentInput = z.infer<typeof meetingSourceSegmentSchema>;
export type MeetingSourceTrack = (typeof MEETING_SOURCE_TRACKS)[number];
export type MeetingTranscriptionSourceTrack =
  | MeetingSourceTrack
  | "candidate"
  | "mixed"
  | `participant-${string}`;

export interface SmallMeetingUploadInstruction {
  contentType: string;
  expiresAt: string;
  headers: Record<string, string>;
  method: "PUT";
  sizeBytes: number;
  track: MeetingSourceTrack;
  url: string;
}

export interface MeetingMultipartPart {
  md5Base64: string;
  offsetBytes: number;
  partNumber: number;
  sizeBytes: number;
}

export interface MultipartMeetingSourceAsset extends MeetingSourceAssetInput {
  parts: MeetingMultipartPart[];
}

export type MultipartSavedMeetingDescriptor = CreateMultipartSavedMeetingInput;

export interface MultipartMeetingUploadInstruction extends Omit<MeetingMultipartPart, "md5Base64"> {
  expiresAt: string;
  headers: Record<string, string>;
  method: "PUT";
  track: MeetingSourceTrack;
  url: string;
}

export interface MultipartSavedMeetingResponse {
  meetingId: string;
  recoveryCopyDeleteAfter: string | null;
  state: "uploading" | "workspace-verified";
  uploads: MultipartMeetingUploadInstruction[];
}

export interface SmallSavedMeetingResponse {
  meetingId: string;
  recoveryCopyDeleteAfter: string | null;
  state: "uploading" | "workspace-verified";
  uploads: SmallMeetingUploadInstruction[];
}

export const MEETING_PROCESSING_STATES = ["processing", "ready", "failed"] as const;
export type MeetingProcessingState = (typeof MEETING_PROCESSING_STATES)[number];
export type MeetingAccessRole = "administrator" | "editor" | "owner" | "viewer";
export type MeetingGrantRole = "editor" | "viewer";
export type MeetingVisibility = "restricted" | "workspace";

export const updateMeetingMetadataSchema = z.object({
  title: z.string().trim().min(1).max(RECORDING_TITLE_MAX_LENGTH),
});

export const updateMeetingShareSchema = z
  .object({
    grants: z
      .array(
        z.object({
          role: z.enum(["editor", "viewer"]),
          userId: z.string().min(1),
        }),
      )
      .max(500),
    visibility: z.enum(["restricted", "workspace"]),
  })
  .superRefine((input, context) => {
    const seen = new Set<string>();
    for (const [index, grant] of input.grants.entries()) {
      if (seen.has(grant.userId)) {
        context.addIssue({
          code: "custom",
          message: "同一成员只能设置一个会议访问角色",
          path: ["grants", index, "userId"],
        });
      }
      seen.add(grant.userId);
    }
  });

export const reassignMeetingOwnerSchema = z.object({ userId: z.string().min(1) });

export const updateMeetingRecruitingContextSchema = z.object({
  recruitingRecordId: z.string().trim().min(1).nullable(),
});

export const createMeetingNoteSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
  meetingTimeMs: z.number().int().nonnegative(),
});

export const updateMeetingNoteSchema = z
  .object({
    body: z.string().trim().min(1).max(10_000).optional(),
    meetingTimeMs: z.number().int().nonnegative().optional(),
  })
  .refine((input) => input.body !== undefined || input.meetingTimeMs !== undefined, {
    message: "至少更新一个字段",
  });

export type UpdateMeetingShareInput = z.infer<typeof updateMeetingShareSchema>;
export type UpdateMeetingMetadataInput = z.infer<typeof updateMeetingMetadataSchema>;
export type UpdateMeetingRecruitingContextInput = z.infer<
  typeof updateMeetingRecruitingContextSchema
>;
export type CreateMeetingNoteInput = z.infer<typeof createMeetingNoteSchema>;
export type UpdateMeetingNoteInput = z.infer<typeof updateMeetingNoteSchema>;

export interface MeetingCreatorSummary {
  id: string;
  image: string | null;
  name: string;
}

export interface MeetingLibraryItem {
  accessRole: MeetingAccessRole;
  creator: MeetingCreatorSummary;
  durationMs: number;
  id: string;
  processingState: MeetingProcessingState;
  recordingAvailable: boolean;
  savedAt: string;
  title: string;
  workspaceCustodied: boolean;
}

export interface MeetingDetail extends MeetingLibraryItem {
  archived: boolean;
  liveSummary: MeetingLiveSummarySnapshot | null;
  startedAt: string;
  verifiedAt: string | null;
}

export interface TrashedMeetingItem {
  creator: MeetingCreatorSummary;
  id: string;
  purgeAfter: string;
  savedAt: string;
  title: string;
  trashedAt: string;
}

export const TRASHED_MEETING_SORT_COLUMNS = ["trashedAt", "savedAt", "title"] as const;
export type TrashedMeetingSortColumn = (typeof TRASHED_MEETING_SORT_COLUMNS)[number];

export const trashedMeetingListQuerySchema = makePaginationSchema(TRASHED_MEETING_SORT_COLUMNS, {
  defaultSortBy: "trashedAt",
  defaultSortOrder: "desc",
}).extend({
  search: z.string().trim().max(120).optional().default(""),
});

export type TrashedMeetingListQuery = z.infer<typeof trashedMeetingListQuerySchema>;
export type PaginatedTrashedMeetings = PaginatedResult<TrashedMeetingItem>;

export interface MeetingRecruitingRecordSummary {
  candidateName: string;
  id: string;
  jobDescriptionName: string | null;
  outcome: string;
  pipelineStage: string;
  targetRole: string | null;
}

export interface MeetingRecruitingContextLink {
  linkedAt: string;
  linkedBy: string | null;
  record: MeetingRecruitingRecordSummary;
  templateSuggestion: "recruiting-interview";
}

export interface MeetingRecruitingContextSettings {
  canManage: boolean;
  link: MeetingRecruitingContextLink | null;
}

export interface MeetingPlaybackAuthorization {
  expiresAt: string;
  url: string;
}

export interface MeetingNote {
  author: { id: string | null; name: string };
  body: string;
  canDelete: boolean;
  canEdit: boolean;
  createdAt: string;
  id: string;
  meetingTimeMs: number;
  updatedAt: string;
}

export interface MeetingShareGrant {
  member: MeetingCreatorSummary;
  role: MeetingGrantRole;
}

export interface MeetingShareSettings {
  grants: MeetingShareGrant[];
  owner: MeetingCreatorSummary;
  visibility: MeetingVisibility;
  workspaceCustodied: boolean;
}
