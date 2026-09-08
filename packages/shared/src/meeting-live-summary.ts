import { z } from "zod";

// The generator allows two attempts; the HTTP caller must outlive both plus transport overhead.
export const MEETING_LIVE_SUMMARY_MODEL_TIMEOUT_MS = 75_000;
export const MEETING_LIVE_SUMMARY_REQUEST_TIMEOUT_MS =
  MEETING_LIVE_SUMMARY_MODEL_TIMEOUT_MS * 2 + 15_000;

export const MEETING_LIVE_SUMMARY_MAX_TOPICS = 12;
export const MEETING_LIVE_SUMMARY_MAX_POINTS_PER_TOPIC = 8;
export const MEETING_LIVE_SUMMARY_MAX_EVIDENCE_TURNS = 30;
export const MEETING_LIVE_SUMMARY_MAX_TURNS_PER_REQUEST = 200;
export const MEETING_LIVE_SUMMARY_MAX_REQUEST_CHARACTERS = 30_000;
export const MEETING_LIVE_SUMMARY_MAX_CONTEXT_CHARACTERS = 80_000;

export const meetingLiveSummaryTemplateSchema = z.enum(["general", "recruiting-interview"]);
export type MeetingLiveSummaryTemplate = z.infer<typeof meetingLiveSummaryTemplateSchema>;

const evidenceTurnIdsSchema = z.array(z.string().min(1).max(512)).min(1).max(10_000);

const meetingLiveSummaryPointSchema = z
  .object({
    endMs: z.number().int().nonnegative(),
    evidenceTurnIds: evidenceTurnIdsSchema,
    id: z.string().min(1).max(128),
    kind: z.enum(["fact", "question"]),
    startMs: z.number().int().nonnegative(),
    text: z.string().trim().min(1).max(1000),
  })
  .strict()
  .refine((point) => point.endMs >= point.startMs, "总结节点结束时间不能早于开始时间");

const meetingLiveSummaryTopicSchema = z
  .object({
    endMs: z.number().int().nonnegative(),
    evidenceTurnIds: evidenceTurnIdsSchema,
    id: z.string().min(1).max(128),
    points: z.array(meetingLiveSummaryPointSchema),
    startMs: z.number().int().nonnegative(),
    status: z.enum(["active", "completed"]),
    summary: z.string().trim().min(1).max(2000),
    title: z.string().trim().min(1).max(200),
  })
  .strict()
  .refine((topic) => topic.endMs >= topic.startMs, "总结主题结束时间不能早于开始时间");

export const meetingSummaryPendingThoughtSchema = z
  .object({
    endMs: z.number().int().nonnegative().optional(),
    evidenceTurnIds: z.array(z.string().min(1).max(512)).min(1).max(3),
    startMs: z.number().int().nonnegative().optional(),
    text: z.string().min(1).max(500),
  })
  .strict();

export const meetingLiveSummarySnapshotSchema = z
  .object({
    captureId: z.uuid(),
    coveredThroughMs: z.number().int().nonnegative(),
    coveredThroughTurnId: z.string().min(1).max(512),
    generatedAt: z.string().datetime({ offset: true }),
    model: z.string().min(1).max(128),
    pendingThoughts: z.array(meetingSummaryPendingThoughtSchema).max(5).optional(),
    provider: z.string().min(1).max(128),
    revision: z.number().int().positive(),
    sourceFingerprint: z
      .object({ count: z.number().int().positive(), digest: z.string().length(64) })
      .optional(),
    summary: z.string().trim().min(1).max(4000),
    template: meetingLiveSummaryTemplateSchema,
    topics: z.array(meetingLiveSummaryTopicSchema).min(1),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const ids = new Set<string>();
    let activeTopics = 0;
    for (const [topicIndex, topic] of snapshot.topics.entries()) {
      if (ids.has(topic.id)) {
        context.addIssue({
          code: "custom",
          message: "实时总结节点 ID 重复",
          path: ["topics", topicIndex, "id"],
        });
      }
      ids.add(topic.id);
      if (topic.status === "active") {
        activeTopics += 1;
      }
      const topicEvidence = new Set(topic.evidenceTurnIds);
      for (const [pointIndex, point] of topic.points.entries()) {
        if (ids.has(point.id)) {
          context.addIssue({
            code: "custom",
            message: "实时总结节点 ID 重复",
            path: ["topics", topicIndex, "points", pointIndex, "id"],
          });
        }
        ids.add(point.id);
        if (point.evidenceTurnIds.some((id) => !topicEvidence.has(id))) {
          context.addIssue({
            code: "custom",
            message: "总结子节点证据必须包含在所属主题证据中",
            path: ["topics", topicIndex, "points", pointIndex, "evidenceTurnIds"],
          });
        }
      }
    }
    if (activeTopics > 1) {
      context.addIssue({
        code: "custom",
        message: "实时总结最多只能有一个当前主题",
        path: ["topics"],
      });
    }
  });

export type MeetingLiveSummarySnapshot = z.infer<typeof meetingLiveSummarySnapshotSchema>;

/** Local progress is committed with the matching summary revision, never sent as AI context. */
export const meetingLiveSummaryCheckpointSchema = z.object({
  revision: z.number().int().positive(),
  turns: z.record(z.string(), z.string()),
});
export type MeetingLiveSummaryCheckpoint = z.infer<typeof meetingLiveSummaryCheckpointSchema>;

export class MeetingSummaryPendingError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MeetingSummaryPendingError";
  }
}
export type MeetingLiveSummaryTopic = MeetingLiveSummarySnapshot["topics"][number];
export type MeetingLiveSummaryPoint = MeetingLiveSummaryTopic["points"][number];

export const meetingLiveSummaryTurnSchema = z
  .object({
    endMs: z.number().int().nonnegative(),
    final: z.literal(true),
    id: z.string().min(1).max(512),
    speakerDisplayName: z.string().trim().min(1).max(128).nullable(),
    speakerKey: z.string().min(1).max(128),
    startMs: z.number().int().nonnegative(),
    text: z.string().trim().min(1).max(10_000),
    track: z.enum(["microphone", "system"]),
  })
  .strict()
  .refine((turn) => turn.endMs >= turn.startMs, "字幕结束时间不能早于开始时间");

export type MeetingLiveSummaryTurn = z.infer<typeof meetingLiveSummaryTurnSchema>;

export const meetingLiveSummaryRequestSchema = z
  .object({
    baseSnapshot: meetingLiveSummarySnapshotSchema.nullable(),
    captureId: z.uuid(),
    contextTurns: z.array(meetingLiveSummaryTurnSchema).max(3).optional(),
    template: meetingLiveSummaryTemplateSchema,
    turns: z
      .array(meetingLiveSummaryTurnSchema)
      .min(1)
      .max(MEETING_LIVE_SUMMARY_MAX_TURNS_PER_REQUEST),
  })
  .strict()
  .superRefine((request, context) => {
    if (
      request.baseSnapshot &&
      (request.baseSnapshot.captureId !== request.captureId ||
        request.baseSnapshot.template !== request.template)
    ) {
      context.addIssue({
        code: "custom",
        message: "实时总结基线不属于当前录制",
        path: ["baseSnapshot"],
      });
    }
    const ids = new Set<string>();
    for (const [index, turn] of request.turns.entries()) {
      if (ids.has(turn.id)) {
        context.addIssue({
          code: "custom",
          message: "实时总结字幕 ID 重复",
          path: ["turns", index, "id"],
        });
      }
      ids.add(turn.id);
    }
    const totalCharacters = request.turns.reduce((total, turn) => total + turn.text.length, 0);
    if (totalCharacters > MEETING_LIVE_SUMMARY_MAX_REQUEST_CHARACTERS) {
      context.addIssue({ code: "custom", message: "实时总结新增字幕过长", path: ["turns"] });
    }
    const contextCharacters =
      totalCharacters +
      JSON.stringify(request.baseSnapshot).length +
      JSON.stringify(request.contextTurns ?? []).length;
    if (contextCharacters > MEETING_LIVE_SUMMARY_MAX_CONTEXT_CHARACTERS) {
      context.addIssue({ code: "custom", message: "实时总结上下文过长", path: ["baseSnapshot"] });
    }
  });

export type MeetingLiveSummaryRequest = z.infer<typeof meetingLiveSummaryRequestSchema>;
