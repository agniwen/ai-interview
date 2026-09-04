import { z } from "zod";

export const MEETING_TRANSCRIPTION_PROVIDERS = ["tingwu", "deepgram", "openai", "qwen"] as const;
export const meetingTranscriptionProviderSchema = z.enum(MEETING_TRANSCRIPTION_PROVIDERS);
export type MeetingTranscriptionProviderId = z.infer<typeof meetingTranscriptionProviderSchema>;
export const meetingTranscriptRevisionProviderSchema = z.union([
  meetingTranscriptionProviderSchema,
  z.literal("manual"),
]);
export type MeetingTranscriptRevisionProvider = z.infer<
  typeof meetingTranscriptRevisionProviderSchema
>;

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

export const MEETING_LIVE_TRANSCRIPT_PROVIDERS = ["qwen", "deepgram"] as const;
export const meetingLiveTranscriptProviderSchema = z.enum(MEETING_LIVE_TRANSCRIPT_PROVIDERS);
export type MeetingLiveTranscriptProviderId = z.infer<typeof meetingLiveTranscriptProviderSchema>;

export const DEFAULT_DEEPGRAM_ENDPOINTING_MS = 1000;
export const deepgramEndpointingMsSchema = z.number().int().min(10).max(5000);

export interface MeetingLiveTranscriptProviderCapabilities {
  contextPrompting: boolean;
  liveCorrection: boolean;
  speakerDiarization: boolean;
  utteranceEndpointing: boolean;
  vocabulary: boolean;
  wordTimestamps: boolean;
}

/** Capabilities currently implemented by Desktop, not every feature sold by each vendor. */
export const MEETING_LIVE_TRANSCRIPT_PROVIDER_CAPABILITIES = {
  deepgram: {
    contextPrompting: false,
    liveCorrection: false,
    speakerDiarization: true,
    utteranceEndpointing: true,
    vocabulary: false,
    wordTimestamps: true,
  },
  qwen: {
    contextPrompting: true,
    liveCorrection: true,
    speakerDiarization: false,
    utteranceEndpointing: false,
    vocabulary: true,
    wordTimestamps: true,
  },
} as const satisfies Record<
  MeetingLiveTranscriptProviderId,
  MeetingLiveTranscriptProviderCapabilities
>;

const meetingLiveTranscriptDraftSectionSchema = z
  .object({
    id: z.string().min(1).max(256),
    sequence: z.number().int().nonnegative(),
    startedAt: z.string().datetime({ offset: true }),
    track: meetingLiveTranscriptTrackSchema,
  })
  .strict();

export const meetingLiveTranscriptWordSchema = z
  .object({
    endMs: z.number().int().nonnegative(),
    punctuation: z.string().max(16),
    startMs: z.number().int().nonnegative(),
    text: z.string().min(1).max(256),
  })
  .strict()
  .refine((word) => word.endMs >= word.startMs, "词结束时间不能早于开始时间");

export type MeetingLiveTranscriptWord = z.infer<typeof meetingLiveTranscriptWordSchema>;

const meetingLiveTranscriptDraftTurnSchema = z
  .object({
    correctionModel: z.string().min(1).max(128).optional(),
    endMs: z.number().int().nonnegative().optional(),
    final: z.boolean(),
    id: z.string().min(1).max(512),
    originalText: z.string().min(1).max(10_000).optional(),
    sectionId: z.string().min(1).max(256),
    speakerDisplayName: z.string().trim().min(1).max(128).nullable().optional(),
    speakerKey: z.string().min(1).max(128).optional(),
    startMs: z.number().int().nonnegative().optional(),
    text: z.string().trim().min(1).max(10_000),
    track: meetingLiveTranscriptTrackSchema,
    words: z.array(meetingLiveTranscriptWordSchema).max(2000).optional(),
  })
  .strict()
  .superRefine((turn, context) => {
    if (turn.startMs !== undefined && turn.endMs !== undefined && turn.endMs < turn.startMs) {
      context.addIssue({ code: "custom", message: "字幕结束时间不能早于开始时间" });
    }
  });

/** A durable, non-authoritative snapshot captured when local recording stops. */
export const meetingLiveTranscriptDraftSchema = z
  .object({
    capturedAt: z.string().datetime({ offset: true }),
    droppedAudioMs: z.number().finite().nonnegative(),
    droppedPcmFrames: z.number().int().nonnegative(),
    error: z.string().max(2000).nullable(),
    language: z.string().min(1).max(64).optional(),
    model: z.string().min(1).max(128).optional(),
    provider: meetingLiveTranscriptProviderSchema.optional(),
    sections: z.array(meetingLiveTranscriptDraftSectionSchema).max(200),
    turns: z.array(meetingLiveTranscriptDraftTurnSchema).max(10_000),
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

export const meetingLiveTranscriptContextSchema = z.array(z.string().trim().min(1).max(400)).max(5);

export const meetingLiveTranscriptVocabularySchema = z
  .record(
    z.string().trim().min(1).max(128),
    z.union([z.number().int().min(1).max(5), z.literal(50)]),
  )
  .refine((value) => Object.keys(value).length <= 2000, "实时热词不能超过 2000 个");

export const meetingLiveTranscriptHintsSchema = z
  .object({
    context: meetingLiveTranscriptContextSchema,
    vocabulary: meetingLiveTranscriptVocabularySchema,
  })
  .strict();

export type MeetingLiveTranscriptHints = z.infer<typeof meetingLiveTranscriptHintsSchema>;

export interface MeetingLiveTranscriptAuthorization {
  /** wss 端点（仅 relay 型 provider 使用，如 DashScope 实时 ASR）。 */
  baseUrl?: string;
  clientSecret: string;
  expiresAt: string;
  /** provider 识别语言提示（如 qwen realtime 的 session language）。 */
  language?: string;
  /** 建连时的领域/会议上下文；由当前 Desktop 会话生成，不写入长期凭证。 */
  context?: string[];
  /** Deepgram VAD 检测到这段连续静音后，以 speech_final 结束当前话语。 */
  endpointingMs?: number;
  model: string;
  provider: MeetingTranscriptionProviderId;
  /** 可选 VAD 噪声阈值，仅在管理员经过真实音频评测后配置。 */
  speechNoiseThreshold?: number;
  track: MeetingLiveTranscriptTrack;
  /** 当前会议的即时热词；普通权重优先，避免超级热词造成近音误召回。 */
  vocabulary?: Record<string, number>;
}

export const meetingLiveTranscriptAuthorizationSchema = z
  .object({
    baseUrl: z.url().optional(),
    clientSecret: z.string().min(1),
    context: meetingLiveTranscriptContextSchema.optional(),
    endpointingMs: deepgramEndpointingMsSchema.optional(),
    expiresAt: z.string().datetime({ offset: true }),
    language: z.string().min(1).max(64).optional(),
    model: z.string().min(1).max(128),
    provider: meetingTranscriptionProviderSchema,
    speechNoiseThreshold: z.number().min(-1).max(1).optional(),
    track: meetingLiveTranscriptTrackSchema,
    vocabulary: meetingLiveTranscriptVocabularySchema.optional(),
  })
  .strict();

const canonicalTranscriptTurnBaseSchema = z
  .object({
    attribution: z
      .object({
        excludedBySourceIds: z.array(z.string()).optional(),
        method: z.enum(["track", "manual", "unconfirmed", "candidate-excluded"]),
        participantIdentity: z.string().nullable(),
        role: z.enum(["candidate", "interviewer", "unknown"]),
        sourceId: z.string().min(1),
      })
      .nullable()
      .optional(),
    confidence: z.number().min(0).max(1).nullable(),
    endMs: z.number().int().nonnegative(),
    speakerDisplayName: z.string().trim().min(1).max(128).nullable().optional(),
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
  provider: MeetingTranscriptRevisionProvider;
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
