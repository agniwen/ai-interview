import { z } from "zod";

export const MEETING_TRANSCRIPTION_PROVIDERS = ["tingwu", "deepgram", "openai", "qwen"] as const;
export const meetingTranscriptionProviderSchema = z.enum(MEETING_TRANSCRIPTION_PROVIDERS);
export type MeetingTranscriptionProviderId = z.infer<typeof meetingTranscriptionProviderSchema>;

export const updateMeetingTranscriptionPolicySchema = z
  .object({
    allowedProviders: z.array(meetingTranscriptionProviderSchema).max(10),
    fallbackProvider: meetingTranscriptionProviderSchema.nullable(),
    selectedProvider: meetingTranscriptionProviderSchema.nullable(),
    selectionReason: z.string().trim().min(10).max(500).nullable(),
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
    if (input.fallbackProvider && !input.allowedProviders.includes(input.fallbackProvider)) {
      context.addIssue({
        code: "custom",
        message: "回退转录 provider 必须在允许列表中",
        path: ["fallbackProvider"],
      });
    }
    if (input.fallbackProvider && input.fallbackProvider === input.selectedProvider) {
      context.addIssue({
        code: "custom",
        message: "回退转录 provider 必须不同于默认 provider",
        path: ["fallbackProvider"],
      });
    }
    if (input.fallbackProvider && !input.selectedProvider) {
      context.addIssue({
        code: "custom",
        message: "设置回退 provider 前必须先选择默认 provider",
        path: ["fallbackProvider"],
      });
    }
    if (input.selectedProvider && !input.selectionReason) {
      context.addIssue({
        code: "custom",
        message: "选择默认转录 provider 时必须记录理由",
        path: ["selectionReason"],
      });
    }
    if (!input.selectedProvider && input.selectionReason) {
      context.addIssue({
        code: "custom",
        message: "未选择默认转录 provider 时不能记录选择理由",
        path: ["selectionReason"],
      });
    }
  });

export type UpdateMeetingTranscriptionPolicyInput = z.infer<
  typeof updateMeetingTranscriptionPolicySchema
>;

export const meetingLiveTranscriptTrackSchema = z.enum(["microphone", "system"]);
export type MeetingLiveTranscriptTrack = z.infer<typeof meetingLiveTranscriptTrackSchema>;

const meetingLiveTranscriptDraftSectionSchema = z
  .object({
    id: z.string().min(1).max(256),
    sequence: z.number().int().nonnegative(),
    startedAt: z.string().datetime({ offset: true }),
    track: meetingLiveTranscriptTrackSchema,
  })
  .strict();

const meetingLiveTranscriptDraftTurnSchema = z
  .object({
    final: z.boolean(),
    id: z.string().min(1).max(512),
    sectionId: z.string().min(1).max(256),
    text: z.string().trim().min(1).max(10_000),
    track: meetingLiveTranscriptTrackSchema,
  })
  .strict();

/** A durable, non-authoritative snapshot captured when local recording stops. */
export const meetingLiveTranscriptDraftSchema = z
  .object({
    capturedAt: z.string().datetime({ offset: true }),
    droppedAudioMs: z.number().finite().nonnegative(),
    droppedPcmFrames: z.number().int().nonnegative(),
    error: z.string().max(2000).nullable(),
    sections: z.array(meetingLiveTranscriptDraftSectionSchema).max(200),
    turns: z.array(meetingLiveTranscriptDraftTurnSchema).max(500),
  })
  .strict()
  .superRefine((draft, context) => {
    const sectionIds = new Set(draft.sections.map((section) => section.id));
    for (const [index, turn] of draft.turns.entries()) {
      if (!sectionIds.has(turn.sectionId)) {
        context.addIssue({
          code: "custom",
          message: "实时字幕片段引用了不存在的 section",
          path: ["turns", index, "sectionId"],
        });
      }
    }
    if (draft.turns.reduce((total, turn) => total + turn.text.length, 0) > 1_000_000) {
      context.addIssue({
        code: "custom",
        message: "实时字幕草稿总文字长度超过限制",
        path: ["turns"],
      });
    }
  });

export type MeetingLiveTranscriptDraft = z.infer<typeof meetingLiveTranscriptDraftSchema>;

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
  /** wss 端点（仅 relay 型 provider 使用，如 DashScope 实时 ASR）。 */
  baseUrl?: string;
  clientSecret: string;
  expiresAt: string;
  /** provider 识别语言提示（如 qwen realtime 的 session language）。 */
  language?: string;
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

export const MAX_MEETING_TRANSCRIPT_TEXT_CHARS = 1_000_000;

export const canonicalMeetingTranscriptSchema = z
  .object({
    language: z.string().trim().min(1).max(64).nullable(),
    turns: z.array(canonicalMeetingTranscriptTurnSchema).max(10_000),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.turns.reduce((total, turn) => total + turn.text.length, 0) >
      MAX_MEETING_TRANSCRIPT_TEXT_CHARS
    ) {
      context.addIssue({
        code: "custom",
        message: "转录总文字长度超过限制",
        path: ["turns"],
      });
    }
  });

export type CanonicalMeetingTranscript = z.infer<typeof canonicalMeetingTranscriptSchema>;
export type CanonicalMeetingTranscriptTurn = z.infer<typeof canonicalMeetingTranscriptTurnSchema>;

const correctedMeetingTranscriptTurnSchema = canonicalTranscriptTurnBaseSchema.extend({
  confidence: z.null(),
  speakerDisplayName: z.string().trim().min(1).max(128).nullable(),
});

export const createMeetingTranscriptCorrectionSchema = z
  .object({
    language: z.string().trim().min(1).max(64).nullable(),
    sourceRevisionId: z.uuid(),
    turns: z.array(correctedMeetingTranscriptTurnSchema).max(10_000),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.turns.reduce((total, turn) => total + turn.text.length, 0) >
      MAX_MEETING_TRANSCRIPT_TEXT_CHARS
    ) {
      context.addIssue({
        code: "custom",
        message: "人工修订总文字长度超过限制",
        path: ["turns"],
      });
    }
    const displayNames = new Map<string, string | null>();
    let previousStartMs = -1;
    for (const [index, turn] of input.turns.entries()) {
      const { speakerDisplayName: _speakerDisplayName, ...canonicalTurn } = turn;
      const parsed = canonicalMeetingTranscriptTurnSchema.safeParse(canonicalTurn);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          context.addIssue({
            ...issue,
            path: ["turns", index, ...issue.path],
          });
        }
      }
      if (displayNames.has(turn.speakerKey)) {
        if (displayNames.get(turn.speakerKey) !== turn.speakerDisplayName) {
          context.addIssue({
            code: "custom",
            message: "同一 speakerKey 的展示名必须一致",
            path: ["turns", index, "speakerDisplayName"],
          });
        }
      } else {
        displayNames.set(turn.speakerKey, turn.speakerDisplayName);
      }
      if (turn.startMs < previousStartMs) {
        context.addIssue({
          code: "custom",
          message: "转录片段必须按开始时间排序",
          path: ["turns", index, "startMs"],
        });
      }
      previousStartMs = turn.startMs;
    }
  });

export type CreateMeetingTranscriptCorrectionInput = z.infer<
  typeof createMeetingTranscriptCorrectionSchema
>;

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
  fallbackProvider: MeetingTranscriptionProviderId | null;
  revision: number;
  selectionReason: string | null;
  selectedProvider: MeetingTranscriptionProviderId | null;
}

export interface FinalMeetingTranscriptTurn extends CanonicalMeetingTranscriptTurn {
  id: string;
  sequence: number;
  speakerDisplayName: string | null;
}

export interface FinalMeetingTranscriptRevision {
  basedOnRevisionId: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
  id: string;
  kind: "final" | "human";
  language: string | null;
  model: string;
  provider: MeetingTranscriptionProviderId;
  region: string;
  revision: number;
  turns: FinalMeetingTranscriptTurn[];
}

export type MeetingTranscriptRevisionSummary = Omit<FinalMeetingTranscriptRevision, "turns">;

export interface MeetingTranscriptRevisionHistory {
  records: MeetingTranscriptRevisionSummary[];
}

export interface MeetingTranscriptResult {
  draft?: MeetingLiveTranscriptDraft | null;
  error: string | null;
  revision: FinalMeetingTranscriptRevision | null;
  state: MeetingTranscriptState;
}
