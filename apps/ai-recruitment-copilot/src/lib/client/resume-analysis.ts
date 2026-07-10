import type {
  InterviewQuestion,
  ResumeAnalysisResult,
  ResumeProfile,
} from "@arc/db-schema/interview/types";
import { createDefaultScheduleEntry } from "@arc/db-schema/studio-interviews";
import type { AnalysisStreamEvent } from "@arc/shared/api-stream";
import type { ResumeLibraryFormValues } from "@arc/shared/studio-resumes";
import type { ResumeReview } from "@arc/shared/resume-review";
import { readAiRunEventStream } from "./ai-run-event-stream";
import { rpc } from "./rpc";

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
    `/api/w/${encodeURIComponent(workspaceSlug)}/interview/parse-resume`,
    {
      body: formData,
      method: "POST",
      signal: options.signal,
    },
  );

  if (!response.ok) {
    const errBody = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errBody?.error ?? "简历解析失败");
  }

  let result: ParsedResumeResult | null = null;
  let streamError: string | null = null;

  await readAiRunEventStream<AnalysisStreamEvent>(
    response,
    (event) => {
      options.onEvent?.(event);
      if (event.type === "run.completed") {
        result = event.output as ParsedResumeResult;
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
  const response = await rpc.api.w[":slug"].interview["match-job-description"].$post(
    { json: { resumeProfile }, param: { slug: workspaceSlug } },
    { init: { signal: options.signal } },
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as {
    matchedId?: string | null;
    reason?: string | null;
  } | null;

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
    `/api/w/${workspaceSlug}/chat/attachments/${attachmentId}/match-job-description`,
    {
      method: "POST",
      signal: options.signal,
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as {
    matchedId?: string | null;
    reason?: string | null;
  } | null;

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
  const response = await rpc.api.w[":slug"].interview["generate-review"].$post(
    {
      json: { jobDescriptionId: jobDescriptionId || null, resumeProfile },
      param: { slug: workspaceSlug },
    },
    { init: { signal } },
  );

  if (!response.ok) {
    const errBody = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errBody?.error ?? "简历评价生成失败");
  }

  let draft = "";
  let result: GenerateResumeReviewResult | null = null;
  let streamError: string | null = null;

  await readAiRunEventStream<AnalysisStreamEvent>(
    response,
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
        const data = event.output as Partial<GenerateResumeReviewResult>;
        if (data.review && data.structuredReview) {
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
  const response = await rpc.api.w[":slug"].interview["generate-review-markdown-stream"].$post(
    {
      json: { jobDescriptionId: jobDescriptionId || null, resumeProfile },
      param: { slug: workspaceSlug },
    },
    { init: { signal } },
  );

  if (!response.ok) {
    const errBody = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errBody?.error ?? "简历评价生成失败");
  }

  let draft = "";
  let result: GenerateResumeReviewResult | null = null;
  let streamError: string | null = null;

  await readAiRunEventStream<AnalysisStreamEvent>(
    response,
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
        const data = event.output as Partial<GenerateResumeReviewResult>;
        if (data.review && data.structuredReview) {
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
  fd.append("status", "ready");
  fd.append("scheduleEntries", JSON.stringify([createDefaultScheduleEntry()]));
  return fd;
}
