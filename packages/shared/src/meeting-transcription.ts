import { z } from "zod";

export const MEETING_TRANSCRIPTION_PROVIDERS = ["openai"] as const;
export const meetingTranscriptionProviderSchema = z.enum(MEETING_TRANSCRIPTION_PROVIDERS);
export type MeetingTranscriptionProviderId = z.infer<typeof meetingTranscriptionProviderSchema>;

export const updateMeetingTranscriptionPolicySchema = z
  .object({
    allowedProviders: z.array(meetingTranscriptionProviderSchema).max(10),
    selectedProvider: meetingTranscriptionProviderSchema.nullable(),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.allowedProviders).size !== input.allowedProviders.length) {
      context.addIssue({
        code: "custom",
        message: "转录 provider 不能重复",
        path: ["allowedProviders"],
      });
    }
    if (input.selectedProvider && !input.allowedProviders.includes(input.selectedProvider)) {
      context.addIssue({
        code: "custom",
        message: "选中的转录 provider 必须在允许列表中",
        path: ["selectedProvider"],
      });
    }
  });

export type UpdateMeetingTranscriptionPolicyInput = z.infer<
  typeof updateMeetingTranscriptionPolicySchema
>;

export const meetingLiveTranscriptTrackSchema = z.enum(["microphone", "system"]);
export type MeetingLiveTranscriptTrack = z.infer<typeof meetingLiveTranscriptTrackSchema>;

export const createMeetingLiveTranscriptAuthorizationSchema = z
  .object({
    captureId: z.uuid(),
    track: meetingLiveTranscriptTrackSchema,
  })
  .strict();

export type CreateMeetingLiveTranscriptAuthorizationInput = z.infer<
  typeof createMeetingLiveTranscriptAuthorizationSchema
>;

export interface MeetingLiveTranscriptAuthorization {
  clientSecret: string;
  expiresAt: string;
  model: string;
  provider: MeetingTranscriptionProviderId;
  track: MeetingLiveTranscriptTrack;
}

const canonicalTranscriptTurnBaseSchema = z
  .object({
    confidence: z.number().min(0).max(1).nullable(),
    endMs: z.number().int().nonnegative(),
    speakerKey: z.string().min(1).max(128),
    startMs: z.number().int().nonnegative(),
    text: z.string().trim().min(1).max(100_000),
    track: z.enum(["local", "remote"]),
  })
  .strict();

export const canonicalMeetingTranscriptTurnSchema = canonicalTranscriptTurnBaseSchema.superRefine(
  (turn, context) => {
    if (turn.endMs <= turn.startMs) {
      context.addIssue({ code: "custom", message: "转录片段结束时间必须晚于开始时间" });
    }
    if (turn.track === "local" && turn.speakerKey !== "local") {
      context.addIssue({ code: "custom", message: "本地音轨 speakerKey 必须为 local" });
    }
    if (turn.track === "remote" && !/^remote-\d+$/.test(turn.speakerKey)) {
      context.addIssue({ code: "custom", message: "远端 speakerKey 格式无效" });
    }
  },
);

export const canonicalMeetingTranscriptSchema = z
  .object({
    language: z.string().trim().min(1).max(64).nullable(),
    turns: z.array(canonicalMeetingTranscriptTurnSchema).max(10_000),
  })
  .strict();

export type CanonicalMeetingTranscript = z.infer<typeof canonicalMeetingTranscriptSchema>;
export type CanonicalMeetingTranscriptTurn = z.infer<typeof canonicalMeetingTranscriptTurnSchema>;

export type MeetingTranscriptState = "failed" | "pending" | "processing" | "ready";

export interface MeetingTranscriptionProviderCandidate {
  id: MeetingTranscriptionProviderId;
  label: string;
  model: string;
  region: string;
}

export interface MeetingTranscriptionPolicy {
  allowedProviders: MeetingTranscriptionProviderId[];
  availableProviders: MeetingTranscriptionProviderCandidate[];
  canManage: boolean;
  revision: number;
  selectedProvider: MeetingTranscriptionProviderId | null;
}

export interface FinalMeetingTranscriptTurn extends CanonicalMeetingTranscriptTurn {
  id: string;
  sequence: number;
}

export interface FinalMeetingTranscriptRevision {
  createdAt: string;
  id: string;
  kind: "final";
  language: string | null;
  model: string;
  provider: MeetingTranscriptionProviderId;
  region: string;
  revision: number;
  turns: FinalMeetingTranscriptTurn[];
}

export interface MeetingTranscriptResult {
  error: string | null;
  revision: FinalMeetingTranscriptRevision | null;
  state: MeetingTranscriptState;
}
