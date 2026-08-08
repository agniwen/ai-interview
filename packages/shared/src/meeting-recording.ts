import { z } from "zod";

export const MEETING_SOURCE_TRACKS = ["microphone", "system"] as const;
export const MEETING_MULTIPART_PART_BYTES = 8 * 1024 * 1024;
export const MEETING_SINGLE_PUT_MAX_BYTES = 100 * 1024 * 1024;
export const SMALL_MEETING_TRACK_MAX_BYTES = MEETING_SINGLE_PUT_MAX_BYTES;
export const MEETING_TRACK_MAX_BYTES = 2_000_000_000;

const sha256Schema = z.string().regex(/^[a-f\d]{64}$/i, "SHA-256 格式无效");

export const meetingSourceAssetSchema = z.object({
  contentType: z
    .string()
    .max(256)
    .refine((value) => value.startsWith("audio/"), "只接受音频 Content-Type"),
  durationMs: z.number().int().nonnegative(),
  fragmentCount: z.number().int().nonnegative(),
  sha256: sha256Schema,
  sizeBytes: z.number().int().positive().max(MEETING_TRACK_MAX_BYTES),
  track: z.enum(MEETING_SOURCE_TRACKS),
});

export const createSmallSavedMeetingSchema = z
  .object({
    assets: z.array(meetingSourceAssetSchema).length(2),
    id: z.string().uuid(),
    manifestSha256: sha256Schema,
    savedAt: z.string().datetime({ offset: true }),
    startedAt: z.string().datetime({ offset: true }),
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
    manifestSha256: sha256Schema,
    savedAt: z.string().datetime({ offset: true }),
    startedAt: z.string().datetime({ offset: true }),
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
export type MeetingSourceTrack = (typeof MEETING_SOURCE_TRACKS)[number];

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
