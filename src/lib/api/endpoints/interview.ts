/**
 * 候选人侧「面试流程」相关 API 与简历分析子流程。
 * Candidate-facing "interview flow" API plus resume-analysis sub-flows.
 *
 * 这一组方法对应 `/api/interview/*` 路由族。其中：
 *   - `/parse-resume` / `/generate-questions` / `/match-job-description` 用于
 *     Studio 后台的"创建面试"流程；
 *   - `/:id/:roundId/*` 用于候选人在前端进入面试房间后的各种交互。
 *
 * Maps to the `/api/interview/*` route family:
 *   - `/parse-resume` / `/generate-questions` / `/match-job-description` are used by
 *     the Studio "create interview" flow;
 *   - `/:id/:roundId/*` cover candidate interactions inside the interview room.
 */

import type { CandidateInterviewView } from "@/lib/interview/interview-record";
import type { ResumeAnalysisResult } from "@/lib/interview/types";
import { apiFetch } from "../client";

/**
 * 候选人本轮面试的可见视图（候选人姓名、目标岗位、当前轮次等）。
 * Candidate-facing view of the current interview round.
 */
export function fetchCandidateInterviewRound(
  interviewId: string,
  roundId: string,
): Promise<CandidateInterviewView | null> {
  return apiFetch<CandidateInterviewView | null>(
    `/api/interview/${encodeURIComponent(interviewId)}/${encodeURIComponent(roundId)}`,
    { allow404: true },
  );
}

/**
 * 取一个 LiveKit access token，让候选人可以加入面试房间。
 * Mint a LiveKit access token so the candidate can join the interview room.
 */
export interface LivekitTokenResponse {
  token: string;
  roomName: string;
  serverUrl?: string;
}

export function requestLivekitToken(
  interviewId: string,
  roundId: string,
  payload?: Record<string, unknown>,
): Promise<LivekitTokenResponse> {
  return apiFetch<LivekitTokenResponse>(
    `/api/interview/${encodeURIComponent(interviewId)}/${encodeURIComponent(roundId)}/livekit-token`,
    { body: payload ?? {}, method: "POST" },
  );
}

/**
 * 通知服务端"本轮面试已完成"，触发后续报告 / 邮件流程。
 * Notify the server that the current round has finished, kicking off reports / emails.
 */
export function completeInterviewRound(
  interviewId: string,
  roundId: string,
): Promise<{ ok: true } | null> {
  return apiFetch<{ ok: true } | null>(
    `/api/interview/${encodeURIComponent(interviewId)}/${encodeURIComponent(roundId)}/complete`,
    { allow404: true, method: "POST" },
  );
}

/**
 * 简历解析（PDF → 结构化 ResumeProfile + 默认题集）。表单上传，传入 multipart/form-data。
 * Parse a resume (PDF → structured ResumeProfile + default question set). Multipart upload.
 *
 * @param resume 候选人简历文件 / Candidate resume file.
 */
export function parseResume(resume: File): Promise<ResumeAnalysisResult> {
  const form = new FormData();
  form.append("resume", resume);
  return apiFetch<ResumeAnalysisResult>("/api/interview/parse-resume", {
    body: form,
    method: "POST",
  });
}

/**
 * 让 LLM 根据 JD 在题库中挑出与岗位最匹配的若干题。
 * Ask the LLM to pick the questions in the bank that best match the JD.
 */
export function matchJobDescription(payload: {
  jobDescription: string;
  resumeProfile?: unknown;
}): Promise<{ matchedQuestions: string[] }> {
  return apiFetch<{ matchedQuestions: string[] }>("/api/interview/match-job-description", {
    body: payload,
    method: "POST",
  });
}

/**
 * 让 LLM 基于 ResumeProfile + JD 生成一组面试题。
 * Generate an interview-question set from the ResumeProfile + JD.
 */
export function generateInterviewQuestions(payload: {
  resumeProfile: unknown;
  jobDescription?: string;
}): Promise<ResumeAnalysisResult["interviewQuestions"]> {
  return apiFetch<ResumeAnalysisResult["interviewQuestions"]>("/api/interview/generate-questions", {
    body: payload,
    method: "POST",
  });
}
