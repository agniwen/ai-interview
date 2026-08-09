import { z } from "zod";

export const MEETING_INTELLIGENCE_TEMPLATES = ["general", "recruiting-interview"] as const;
export const meetingIntelligenceTemplateSchema = z.enum(MEETING_INTELLIGENCE_TEMPLATES);
export type MeetingIntelligenceTemplate = z.infer<typeof meetingIntelligenceTemplateSchema>;

const evidenceTurnIdsSchema = z.array(z.string().min(1).max(128)).min(1).max(50);

const evidenceItemBase = z.object({
  evidenceTurnIds: evidenceTurnIdsSchema,
});

export const generalMeetingIntelligenceSchema = z
  .object({
    actionItems: z
      .array(
        evidenceItemBase.extend({
          dueDate: z.string().trim().min(1).max(128).nullable(),
          owner: z.string().trim().min(1).max(256).nullable(),
          task: z.string().trim().min(1).max(2000),
        }),
      )
      .max(100),
    decisions: z
      .array(evidenceItemBase.extend({ statement: z.string().trim().min(1).max(2000) }))
      .max(100),
    openQuestions: z
      .array(evidenceItemBase.extend({ question: z.string().trim().min(1).max(2000) }))
      .max(100),
    summary: z.string().trim().min(1).max(20_000),
    template: z.literal("general"),
    topics: z
      .array(
        evidenceItemBase.extend({
          summary: z.string().trim().min(1).max(5000),
          title: z.string().trim().min(1).max(500),
        }),
      )
      .max(100),
  })
  .strict();

export const recruitingMeetingIntelligenceSchema = z
  .object({
    candidateStatements: z
      .array(
        evidenceItemBase.extend({
          attribution: z.enum(["candidate", "interviewer", "unknown"]),
          statement: z.string().trim().min(1).max(2000),
          verification: z.enum(["stated", "needs-verification"]),
        }),
      )
      .max(200),
    followUpActions: z
      .array(
        evidenceItemBase.extend({
          dueDate: z.string().trim().min(1).max(128).nullable(),
          owner: z.string().trim().min(1).max(256).nullable(),
          task: z.string().trim().min(1).max(2000),
        }),
      )
      .max(100),
    keyExperience: z
      .array(evidenceItemBase.extend({ statement: z.string().trim().min(1).max(2000) }))
      .max(200),
    summary: z.string().trim().min(1).max(20_000),
    template: z.literal("recruiting-interview"),
    verificationItems: z
      .array(evidenceItemBase.extend({ statement: z.string().trim().min(1).max(2000) }))
      .max(100),
  })
  .strict();

const recruitingDecisionPatterns = [
  /(?:建议|推荐|决定|判定).{0,12}(?:录用|聘用|淘汰|拒绝)(?:该|此|这名)?候选人/u,
  /(?:建议|推荐|决定|判定).{0,12}(?:该|此|这名)?候选人.{0,8}(?:通过(?:本轮|本次)?面试|不通过|进入(?:下一轮|下轮|下一阶段|招聘流程))/u,
  /(?:建议|决定).{0,8}(?:通过|不通过)(?:该|此|这名)?候选人/u,
  /\b(?:hire|reject)\s+(?:the\s+)?(?:candidate|applicant)\b/iu,
  /\b(?:move|advance)\s+(?:the\s+)?(?:candidate|applicant)\s+(?:forward|to\s+(?:the\s+)?next\s+(?:round|stage))\b/iu,
  /\b(?:we|i|the\s+(?:panel|interviewer|team))\s+(?:recommend|decide|decided|conclude).{0,50}(?:hire|reject|pass|fail|move|advance).{0,30}(?:candidate|applicant)\b/iu,
  /\b(?:candidate|applicant).{0,15}(?:should|must|will).{0,8}(?:be\s+)?(?:hired|rejected|advanced)\b/iu,
];

function recruitingText(payload: z.infer<typeof recruitingMeetingIntelligenceSchema>): string[] {
  return [
    payload.summary,
    ...payload.candidateStatements.map((item) => item.statement),
    ...payload.keyExperience.map((item) => item.statement),
    ...payload.verificationItems.map((item) => item.statement),
    ...payload.followUpActions.map((item) => item.task),
  ];
}

export function containsAutomaticHiringDecision(
  payload: z.infer<typeof recruitingMeetingIntelligenceSchema>,
): boolean {
  return recruitingText(payload).some((text) =>
    recruitingDecisionPatterns.some((pattern) => pattern.test(text)),
  );
}

export const meetingIntelligencePayloadSchema = z
  .discriminatedUnion("template", [
    generalMeetingIntelligenceSchema,
    recruitingMeetingIntelligenceSchema,
  ])
  .superRefine((payload, context) => {
    if (payload.template === "recruiting-interview" && containsAutomaticHiringDecision(payload)) {
      context.addIssue({
        code: "custom",
        message: "Recruiting Interview intelligence 不得包含自动招聘决定",
      });
    }
  });
export type MeetingIntelligencePayload = z.infer<typeof meetingIntelligencePayloadSchema>;

export const MEETING_INTELLIGENCE_DECISION_POLICY_VERSION = "hiring-decision-v1" as const;
export const MEETING_INTELLIGENCE_GENERATION_PROGRESS_VERSION = "map-reduce-v1" as const;

export const meetingIntelligenceCheckpointSchema = z
  .object({
    content: meetingIntelligencePayloadSchema,
    decisionPolicy: z.object({
      classification: z.literal("allowed"),
      version: z.literal(MEETING_INTELLIGENCE_DECISION_POLICY_VERSION),
    }),
  })
  .strict();
export type MeetingIntelligenceCheckpoint = z.infer<typeof meetingIntelligenceCheckpointSchema>;

const meetingIntelligenceProgressBaseSchema = z.object({
  kind: z.literal("progress"),
  maxReduceChars: z.number().int().positive(),
  maxTranscriptChars: z.number().int().positive(),
  version: z.literal(MEETING_INTELLIGENCE_GENERATION_PROGRESS_VERSION),
});

export const meetingIntelligenceGenerationProgressSchema = z.discriminatedUnion("phase", [
  meetingIntelligenceProgressBaseSchema.extend({
    completed: z.array(meetingIntelligencePayloadSchema).max(10_000),
    phase: z.literal("map"),
  }),
  meetingIntelligenceProgressBaseSchema.extend({
    completed: z.array(meetingIntelligencePayloadSchema).max(10_000),
    phase: z.literal("reduce"),
    source: z.array(meetingIntelligencePayloadSchema).min(2).max(10_000),
  }),
]);
export type MeetingIntelligenceGenerationProgress = z.infer<
  typeof meetingIntelligenceGenerationProgressSchema
>;

export const meetingIntelligenceRunResultSchema = z.union([
  meetingIntelligenceCheckpointSchema,
  meetingIntelligenceGenerationProgressSchema,
]);

export class MeetingIntelligenceTerminalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeetingIntelligenceTerminalError";
  }
}

export function isMeetingIntelligenceTerminalError(
  error: unknown,
): error is MeetingIntelligenceTerminalError {
  return error instanceof Error && error.name === "MeetingIntelligenceTerminalError";
}

export function createMeetingIntelligenceLeaseLostError(): Error {
  const error = new Error("Meeting Intelligence processing lease 已失效");
  error.name = "MeetingIntelligenceLeaseLostError";
  return error;
}

export function isMeetingIntelligenceLeaseLostError(error: unknown): error is Error {
  return error instanceof Error && error.name === "MeetingIntelligenceLeaseLostError";
}

export const requestMeetingIntelligenceSchema = z
  .object({ template: meetingIntelligenceTemplateSchema })
  .strict();
export type RequestMeetingIntelligenceInput = z.infer<typeof requestMeetingIntelligenceSchema>;

function evidenceLists(payload: MeetingIntelligencePayload): string[][] {
  if (payload.template === "general") {
    return [
      ...payload.topics,
      ...payload.decisions,
      ...payload.actionItems,
      ...payload.openQuestions,
    ].map((item) => item.evidenceTurnIds);
  }
  return [
    ...payload.candidateStatements,
    ...payload.keyExperience,
    ...payload.verificationItems,
    ...payload.followUpActions,
  ].map((item) => item.evidenceTurnIds);
}

export function validateMeetingIntelligenceEvidence(
  payload: MeetingIntelligencePayload,
  transcriptTurnIds: ReadonlySet<string>,
): boolean {
  return evidenceLists(payload).every((ids) => ids.every((id) => transcriptTurnIds.has(id)));
}

export type MeetingIntelligenceState = "failed" | "pending" | "processing" | "ready";

export interface MeetingIntelligenceRevision {
  content: MeetingIntelligencePayload;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
  id: string;
  model: string;
  promptVersion: string;
  provider: string;
  revision: number;
  template: MeetingIntelligenceTemplate;
  transcriptRevisionId: string;
}

export interface MeetingIntelligenceResult {
  canRegenerate: boolean;
  current: MeetingIntelligenceRevision | null;
  error: string | null;
  history: MeetingIntelligenceRevision[];
  state: MeetingIntelligenceState;
  suggestedTemplate: MeetingIntelligenceTemplate;
}
