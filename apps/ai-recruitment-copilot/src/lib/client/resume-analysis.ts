import "client-only";

import type {
  InterviewQuestion,
  ResumeAnalysisResult,
  ResumeProfile,
} from "@arc/db-schema/interview/types";
import { createDefaultScheduleEntry } from "@arc/db-schema/studio-interviews";
import type { AnalysisStreamEvent } from "@arc/shared/api-stream";
import type { ResumeLibraryFormValues } from "@arc/shared/studio-resumes";
import { readNdjsonStream } from "./ndjson-stream";
import { rpc } from "./rpc";

export interface ParsedResumeResult {
  fileName: string;
  resumeProfile: ResumeProfile;
}

export interface JobDescriptionMatchResult {
  matchedId: string | null;
  reason: string | null;
}

export interface StreamRequestOptions {
  signal?: AbortSignal;
  onEvent?: (event: AnalysisStreamEvent) => void;
}

export interface GenerateResumeReviewOptions {
  jobDescriptionId?: string | null;
  onDraftChange?: (review: string) => void;
  resumeProfile: ResumeProfile;
  signal?: AbortSignal;
}

export async function parseResumeFile(
  file: File,
  options: StreamRequestOptions = {},
): Promise<ParsedResumeResult> {
  const formData = new FormData();
  formData.append("resume", file);

  const response = await fetch("/api/interview/parse-resume", {
    body: formData,
    method: "POST",
    signal: options.signal,
  });

  if (!response.ok) {
    const errBody = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errBody?.error ?? "简历解析失败");
  }

  let result: ParsedResumeResult | null = null;
  let streamError: string | null = null;

  await readNdjsonStream<AnalysisStreamEvent>(
    response,
    (event) => {
      options.onEvent?.(event);
      if (event.type === "result") {
        result = event.data as ParsedResumeResult;
      }
      if (event.type === "error") {
        streamError = event.message;
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
  resumeProfile: ResumeProfile,
  options: { signal?: AbortSignal } = {},
): Promise<JobDescriptionMatchResult | null> {
  const response = await rpc.api.interview["match-job-description"].$post(
    { json: { resumeProfile } },
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

export async function generateResumeReview({
  jobDescriptionId,
  onDraftChange,
  resumeProfile,
  signal,
}: GenerateResumeReviewOptions): Promise<string | null> {
  const response = await rpc.api.interview["generate-review"].$post(
    { json: { jobDescriptionId: jobDescriptionId || null, resumeProfile } },
    { init: { signal } },
  );

  if (!response.ok) {
    const errBody = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errBody?.error ?? "简历评价生成失败");
  }

  let draft = "";
  let result: string | null = null;
  let streamError: string | null = null;

  await readNdjsonStream<AnalysisStreamEvent>(
    response,
    (event) => {
      if (signal?.aborted) {
        return;
      }
      if (event.type === "text-delta") {
        draft += event.text;
        onDraftChange?.(draft);
      }
      if (event.type === "result") {
        const data = event.data as { review?: string };
        result = data.review ?? null;
        if (result) {
          onDraftChange?.(result);
        }
      }
      if (event.type === "error") {
        streamError = event.message;
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

  return result ?? (draft.trim() ? draft : null);
}

export function buildResumePayload(
  fileName: string,
  resumeProfile: ResumeProfile,
  interviewQuestions: InterviewQuestion[] = [],
): ResumeAnalysisResult {
  return {
    fileName,
    interviewQuestions,
    resumeProfile,
  };
}

export function formValuesFromResumeProfile(
  resumeProfile: ResumeProfile,
  overrides: Partial<ResumeLibraryFormValues> = {},
): ResumeLibraryFormValues {
  return {
    candidateEmail: resumeProfile.email ?? "",
    candidateName: resumeProfile.name || "未命名候选人",
    candidatePhone: resumeProfile.phone ?? "",
    jobDescriptionId: "",
    notes: "",
    targetRole: resumeProfile.targetRoles[0] ?? "",
    ...overrides,
  };
}

function appendCandidateFields(fd: FormData, value: ResumeLibraryFormValues) {
  fd.append("candidateName", value.candidateName);
  fd.append("candidateEmail", value.candidateEmail);
  fd.append("candidatePhone", value.candidatePhone);
  fd.append("targetRole", value.targetRole);
  fd.append("jobDescriptionId", value.jobDescriptionId);
  fd.append("notes", value.notes);
}

export function buildSaveOnlyResumeFormData(
  value: ResumeLibraryFormValues,
  file: File | null,
  resumePayload: ResumeAnalysisResult | null,
): FormData {
  const fd = new FormData();
  appendCandidateFields(fd, value);
  if (file) {
    fd.append("resume", file);
  }
  if (resumePayload) {
    fd.append("resumePayload", JSON.stringify(resumePayload));
  }
  return fd;
}

export function buildSaveAndStartResumeFormData(
  value: ResumeLibraryFormValues,
  file: File | null,
  resumePayload: ResumeAnalysisResult | null,
): FormData {
  const fd = buildSaveOnlyResumeFormData(value, file, resumePayload);
  fd.append("status", "ready");
  fd.append("scheduleEntries", JSON.stringify([createDefaultScheduleEntry()]));
  return fd;
}
