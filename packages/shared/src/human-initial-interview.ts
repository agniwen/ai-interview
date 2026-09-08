import { z } from "zod";
import { meetingLiveSummarySnapshotSchema } from "./meeting-live-summary";
import { qualitativeResumeEvaluationSchema } from "@app/db-schema/qualitative-resume-evaluation";
import { studioInterviewQuestionClientSchema } from "@app/db-schema/studio-interviews";
import { canonicalMeetingTranscriptTurnSchema } from "./meeting-transcription";

export const initialInterviewTurnSchema = canonicalMeetingTranscriptTurnSchema.safeExtend({
  id: z.string().min(1),
  sequence: z.number().int().nonnegative(),
});
export const initialInterviewTurnsSchema = z.array(initialInterviewTurnSchema).min(1).max(50_000);
export type InitialInterviewTurn = z.infer<typeof initialInterviewTurnSchema>;
export const initialInterviewRolesSchema = z.record(
  z.string().min(1),
  z.enum(["candidate", "interviewer"]),
);
export type InitialInterviewRoles = z.infer<typeof initialInterviewRolesSchema>;

export const initialInterviewHrEvaluationSchema = z
  .object({
    availability: z.string().nullable(),
    careerProgression: z.string().nullable(),
    compensationExpectations: z.string().nullable(),
    jobMotivation: z.string().nullable(),
    overseasTravel: z.string().nullable(),
    projectHighlights: z.string().nullable(),
    recentWork: z.string().nullable(),
  })
  .strict();

export const initialInterviewSnapshotSchema = z
  .object({
    candidateName: z.string(),
    durationMs: z.number().nonnegative(),
    interviewQuestions: z.array(studioInterviewQuestionClientSchema),
    job: z.object({ id: z.string(), prompt: z.string(), title: z.string() }).nullable(),
    liveSummary: meetingLiveSummarySnapshotSchema.nullable().optional(),
    qualitativeResumeEvaluation: qualitativeResumeEvaluationSchema.nullable(),
    recordedAt: z.string(),
    recording: z.object({ contentType: z.string(), sizeBytes: z.number(), storageKey: z.string() }),
    resume: z.object({ fileName: z.string(), storageKey: z.string() }).nullable(),
    resumeEmploymentContext: z.string(),
    resumeText: z.string(),
    sourceMeetingId: z.string(),
    sourceTranscriptRevisionId: z.string(),
    title: z.string(),
    turns: initialInterviewTurnsSchema,
  })
  .strict();
export type InitialInterviewSnapshot = z.infer<typeof initialInterviewSnapshotSchema>;

export const initialInterviewStatusSchema = z.enum([
  "queued",
  "identifying",
  "needs_speakers",
  "generating",
  "ready",
  "failed",
]);
export type InitialInterviewStatus = z.infer<typeof initialInterviewStatusSchema>;

export const createInitialInterviewSchema = z
  .object({
    meetingId: z.string().min(1),
    overwriteDocumentId: z.string().min(1).nullable().default(null),
    requestId: z.string().uuid(),
  })
  .strict();

export const regenerateInitialInterviewSchema = z
  .object({
    overwriteDocumentId: z.string().min(1).nullable().default(null),
    requestId: z.string().uuid(),
    roles: initialInterviewRolesSchema.optional(),
    turns: initialInterviewTurnsSchema.optional(),
  })
  .strict();

export function getInitialInterviewRolesIssue(
  turns: InitialInterviewTurn[],
  roles: InitialInterviewRoles,
): string | null {
  const keys = new Set(turns.map((turn) => turn.speakerKey));
  if ([...keys].some((key) => !roles[key])) {
    return "请为每位说话人指定候选人或 HR。";
  }
  if (Object.keys(roles).some((key) => !keys.has(key))) {
    return "说话人已发生变化，请重新确认。";
  }
  if (![...keys].some((key) => roles[key] === "candidate")) {
    return "请至少指定一位候选人。";
  }
  if (![...keys].some((key) => roles[key] === "interviewer")) {
    return "请至少指定一位 HR；无法区分双方的录音不能生成评价。";
  }
  return null;
}

export interface InitialInterviewVersion {
  id: string;
  version: number;
  status: InitialInterviewStatus;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
  documentId: string | null;
  overwriteDocumentId: string | null;
  documentUrl: string | null;
  roles: InitialInterviewRoles;
  turns: InitialInterviewTurn[];
  evaluation: z.infer<typeof initialInterviewHrEvaluationSchema> | null;
}

export interface HumanInitialInterviewDetail {
  id: string;
  recruitingRecordId: string;
  createdAt: string;
  snapshot: InitialInterviewSnapshot;
  versions: InitialInterviewVersion[];
}

export interface HumanInitialInterviewSummary {
  id: string;
  title: string;
  recordedAt: string;
  durationMs: number;
  createdAt: string;
  versionCount: number;
  latestVersion: Omit<InitialInterviewVersion, "turns" | "roles" | "evaluation">;
}

export const INITIAL_INTERVIEW_STATUS_LABELS = {
  failed: "生成失败",
  generating: "生成中",
  identifying: "识别说话人",
  needs_speakers: "待重新生成",
  queued: "等待生成",
  ready: "已生成",
} satisfies Record<InitialInterviewStatus, string>;

export interface InitialInterviewList {
  canDelete: boolean;
  canGenerate: boolean;
  records: HumanInitialInterviewSummary[];
  document: { documentId: string | null; documentUrl: string | null; status: string } | null;
}

export const initialInterviewKeys = {
  detail: (slug: string, recordId: string, snapshotId: string) =>
    ["initial-interview-detail", slug, recordId, snapshotId] as const,
  list: (slug: string, recordId: string) => ["initial-interviews", slug, recordId] as const,
  playback: (slug: string, recordId: string, snapshotId: string) =>
    ["initial-interview-playback", slug, recordId, snapshotId] as const,
};

export const INITIAL_INTERVIEW_OVERWRITE_DESCRIPTION =
  "将根据本次资料替换现有评价表的 HR 初面七项，包括其中的人工修改。其他评价区域和文档链接保持不变。";

export function isInitialInterviewProcessing(status: InitialInterviewStatus): boolean {
  return status === "queued" || status === "identifying" || status === "generating";
}
