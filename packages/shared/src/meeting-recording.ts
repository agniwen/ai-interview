import { z } from "zod";

export const MEETING_SOURCE_TRACKS = ["microphone", "system"] as const;
export const SMALL_MEETING_TRACK_MAX_BYTES = 512 * 1024 * 1024;

const sha256Schema = z.string().regex(/^[a-f\d]{64}$/i, "SHA-256 格式无效");

export const meetingSourceAssetSchema = z.object({
  contentType: z
    .string()
    .max(256)
    .refine((value) => value.startsWith("audio/"), "只接受音频 Content-Type"),
  durationMs: z.number().int().nonnegative(),
  fragmentCount: z.number().int().nonnegative(),
  sha256: sha256Schema,
  sizeBytes: z.number().int().positive().max(SMALL_MEETING_TRACK_MAX_BYTES),
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
  });

export const completeSmallSavedMeetingSchema = z.object({
  manifestSha256: sha256Schema,
});

export type CreateSmallSavedMeetingInput = z.infer<typeof createSmallSavedMeetingSchema>;
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

export interface SmallSavedMeetingResponse {
  meetingId: string;
  state: "uploading" | "workspace-verified";
  uploads: SmallMeetingUploadInstruction[];
}
