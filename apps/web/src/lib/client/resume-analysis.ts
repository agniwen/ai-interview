import { apiResponse } from "@/lib/client/api/rpc-fetch";
import { backendApiUrl, matchWorkspaceInterviewJobDescription } from "@/lib/client/backend-api";
import type {
  InterviewQuestion,
  ResumeAnalysisResult,
  ResumeProfile,
} from "@arc/db-schema/interview/types";
import { resumeProfileSchema } from "@arc/db-schema/interview/types";
import { createDefaultScheduleEntry } from "@arc/db-schema/studio-interviews";
import type { AnalysisStreamEvent } from "@arc/shared/api-stream";
import type { ResumeLibraryFormValues } from "@arc/shared/studio-resumes";
import { resumeReviewSchema } from "@arc/shared/resume-review";
import type { ResumeReview } from "@arc/shared/resume-review";
import { z } from "zod";
import { analysisStreamEventSchema, readAiRunEventStream } from "./ai-run-event-stream";

export interface ParsedResumeResult {
  fileName: string;
  resumeProfile: ResumeProfile;
  resumeText: string | null;
}

export interface JobDescriptionMatchResult {
  matchedId: string | null;
  reason: string | null;
}

export interface StreamRequestOptions {
  progress?: boolean;
  signal?: AbortSignal;
  onEvent?: (event: AnalysisStreamEvent) => void;
}

export interface GenerateResumeReviewOptions {
  jobDescriptionId?: string | null;
  onEvent?: (event: AnalysisStreamEvent) => void;
  onDraftChange?: (review: string) => void;
  resumeProfile: ResumeProfile;
  signal?: AbortSignal;
  workspaceSlug: string;
}

export interface GenerateResumeReviewResult {
  review: string;
  structuredReview: ResumeReview;
}

export type ResumeCreateDedupPolicy = "check" | "force";

const errorResponseSchema = z.object({ error: z.string().optional() }).nullable();
const jobDescriptionMatchSchema = z
  .object({ matchedId: z.string().nullable().optional(), reason: z.string().nullable().optional() })
  .nullable();
const parsedResumeResultSchema = z.object({
  fileName: z.string(),
  resumeProfile: resumeProfileSchema,
  resumeText: z.string().nullable(),
});
const generateResumeReviewResultSchema = z.object({
  review: z.string(),
  structuredReview: resumeReviewSchema,
});

async function parseJsonResponse<const T>(response: Response, schema: z.ZodType<T>) {
  const raw = await response.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function parseResumeFile(
  workspaceSlug: string,
  file: File,
  options: StreamRequestOptions = {},
): Promise<ParsedResumeResult> {
  const formData = new FormData();
  formData.append("resume", file);
  if (options.progress) {
    formData.append("progress", "1");
  }

  const response = await fetch(
    backendApiUrl(
      `/workspaces/${encodeURIComponent(workspaceSlug)}/copilot/interview-tools/parse-resume`,
    ),
    {
      body: formData,
      credentials: "include",
      method: "POST",
      signal: options.signal,
    },
  );

  if (!response.ok) {
    const errBody = await parseJsonResponse(response, errorResponseSchema);
    throw new Error(errBody?.error ?? "简历解析失败");
  }

  let result: ParsedResumeResult | null = null;
  let streamError: string | null = null;

  await readAiRunEventStream(
    response,
    analysisStreamEventSchema,
    (event) => {
      options.onEvent?.(event);
      if (event.type === "run.completed") {
        const parsed = parsedResumeResultSchema.safeParse(event.output);
        if (parsed.success) {
          result = parsed.data;
        }
      }
      if (event.type === "run.failed") {
        streamError = event.error.message;
      }
    },
    options.signal,
  );

  if (streamError) {
    throw new Error(streamError);
  }

  if (!result) {
    throw new Error("简历解析未返回有效结果");
  }

  return result;
}

export async function matchJobDescriptionForResume(
  workspaceSlug: string,
  resumeProfile: ResumeProfile,
  options: { signal?: AbortSignal } = {},
): Promise<JobDescriptionMatchResult | null> {
  const response = await apiResponse(
    matchWorkspaceInterviewJobDescription({
      body: { resumeProfile },
      path: { workspaceSlug },
      signal: options.signal,
    }),
  );

  if (!response.ok) {
    return null;
  }

  const payload = await parseJsonResponse(response, jobDescriptionMatchSchema);

  return {
    matchedId: payload?.matchedId ?? null,
    reason: payload?.reason ?? null,
  };
}

export async function matchJobDescriptionForChatAttachment(
  workspaceSlug: string,
  attachmentId: string,
  options: { signal?: AbortSignal } = {},
): Promise<JobDescriptionMatchResult | null> {
  const response = await fetch(
    backendApiUrl(
      `/workspaces/${encodeURIComponent(workspaceSlug)}/copilot/attachments/${encodeURIComponent(
        attachmentId,
      )}/match-job-description`,
    ),
    {
      credentials: "include",
      method: "POST",
      signal: options.signal,
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = await parseJsonResponse(response, jobDescriptionMatchSchema);

  return {
    matchedId: payload?.matchedId ?? null,
    reason: payload?.reason ?? null,
  };
}

export async function generateResumeReview({
  jobDescriptionId,
  onEvent,
  onDraftChange,
  resumeProfile,
  signal,
  workspaceSlug,
}: GenerateResumeReviewOptions): Promise<GenerateResumeReviewResult | null> {
  const response = await fetch(
    backendApiUrl(
      `/workspaces/${encodeURIComponent(workspaceSlug)}/copilot/interview-tools/generate-review`,
    ),
    {
      body: JSON.stringify({ jobDescriptionId: jobDescriptionId || null, resumeProfile }),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal,
    },
  );

  if (!response.ok) {
    const errBody = await parseJsonResponse(response, errorResponseSchema);
    throw new Error(errBody?.error ?? "简历评价生成失败");
  }

  let draft = "";
  let result: GenerateResumeReviewResult | null = null;
  let streamError: string | null = null;

  await readAiRunEventStream(
    response,
    analysisStreamEventSchema,
    (event) => {
      if (signal?.aborted) {
        return;
      }
      onEvent?.(event);
      if (event.type === "step.delta") {
        draft += event.text;
        onDraftChange?.(draft);
      }
      if (event.type === "run.completed") {
        const parsed = generateResumeReviewResultSchema.safeParse(event.output);
        if (parsed.success) {
          const { data } = parsed;
          result = { review: data.review, structuredReview: data.structuredReview };
          onDraftChange?.(result.review);
        }
      }
      if (event.type === "run.failed") {
        streamError = event.error.message;
      }
    },
    signal,
  );

  if (signal?.aborted) {
    return null;
  }
  if (streamError) {
    throw new Error(streamError);
  }

  return result ?? null;
}

export async function generateResumeReviewMarkdownFirst({
  jobDescriptionId,
  onEvent,
  onDraftChange,
  resumeProfile,
  signal,
  workspaceSlug,
}: GenerateResumeReviewOptions): Promise<GenerateResumeReviewResult | null> {
  const response = await fetch(
    backendApiUrl(
      `/workspaces/${encodeURIComponent(workspaceSlug)}/copilot/interview-tools/generate-review-markdown-stream`,
    ),
    {
      body: JSON.stringify({ jobDescriptionId: jobDescriptionId || null, resumeProfile }),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal,
    },
  );

  if (!response.ok) {
    const errBody = await parseJsonResponse(response, errorResponseSchema);
    throw new Error(errBody?.error ?? "简历评价生成失败");
  }

  let draft = "";
  let result: GenerateResumeReviewResult | null = null;
  let streamError: string | null = null;

  await readAiRunEventStream(
    response,
    analysisStreamEventSchema,
    (event) => {
      if (signal?.aborted) {
        return;
      }
      onEvent?.(event);
      if (event.type === "step.delta") {
        draft += event.text;
        onDraftChange?.(draft);
      }
      if (event.type === "run.completed") {
        const parsed = generateResumeReviewResultSchema.safeParse(event.output);
        if (parsed.success) {
          const { data } = parsed;
          result = { review: data.review, structuredReview: data.structuredReview };
          onDraftChange?.(result.review);
        }
      }
      if (event.type === "run.failed") {
        streamError = event.error.message;
      }
    },
    signal,
  );

  if (signal?.aborted) {
    return null;
  }
  if (streamError) {
    throw new Error(streamError);
  }

  return result ?? null;
}

export function buildResumePayload(
  fileName: string,
  resumeProfile: ResumeProfile,
  resumeText: string | null = null,
  interviewQuestions: InterviewQuestion[] = [],
): ResumeAnalysisResult {
  return {
    fileName,
    interviewQuestions,
    resumeProfile,
    resumeText,
  };
}

export function formValuesFromResumeProfile(
  resumeProfile: ResumeProfile,
  overrides: Partial<ResumeLibraryFormValues> = {},
): ResumeLibraryFormValues {
  const values = {
    candidateEmail: resumeProfile.email ?? "",
    candidateName: resumeProfile.name || "未命名候选人",
    candidatePhone: resumeProfile.phone ?? "",
    hrResumeAssessment: "",
    jobDescriptionId: "",
    notes: "",
    resumeEvaluationStatus: "unreviewed" as const,
    targetRole: resumeProfile.targetRoles[0] ?? "",
    ...overrides,
  };
  return {
    ...values,
    hrResumeAssessment: values.hrResumeAssessment ?? "",
  };
}

function appendCandidateFields(fd: FormData, value: ResumeLibraryFormValues) {
  fd.append("candidateName", value.candidateName);
  fd.append("candidateEmail", value.candidateEmail);
  fd.append("candidatePhone", value.candidatePhone);
  fd.append("targetRole", value.targetRole);
  fd.append("jobDescriptionId", value.jobDescriptionId);
  fd.append("notes", value.notes);
  fd.append("resumeEvaluationStatus", value.resumeEvaluationStatus);
}

export function buildSaveOnlyResumeFormData(
  value: ResumeLibraryFormValues,
  file: File | null,
  resumePayload: ResumeAnalysisResult | null,
  options: { dedupPolicy?: ResumeCreateDedupPolicy; resumeReview?: ResumeReview | null } = {},
): FormData {
  const fd = new FormData();
  appendCandidateFields(fd, value);
  fd.append("dedupPolicy", options.dedupPolicy ?? "check");
  if (file) {
    fd.append("resume", file);
  }
  if (resumePayload) {
    fd.append("resumePayload", JSON.stringify(resumePayload));
  }
  if (options.resumeReview) {
    fd.append("resumeReview", JSON.stringify(options.resumeReview));
  }
  return fd;
}

export function buildSaveAndStartResumeFormData(
  value: ResumeLibraryFormValues,
  file: File | null,
  resumePayload: ResumeAnalysisResult | null,
  options: { dedupPolicy?: ResumeCreateDedupPolicy; resumeReview?: ResumeReview | null } = {},
): FormData {
  const fd = buildSaveOnlyResumeFormData(value, file, resumePayload, options);
  fd.append("scheduleEntries", JSON.stringify([createDefaultScheduleEntry()]));
  return fd;
}
