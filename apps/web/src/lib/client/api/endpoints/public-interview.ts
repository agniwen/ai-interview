import {
  getPublicInterviewRound,
  getPublicInterviewRoundRecording,
  getPublicInterviewRoundReport,
  getPublicResume,
  listPublicInterviewRoundFormSubmissions,
  listPublicInterviewRoundReports,
  listPublicResumeRounds,
  resolvePublicInterviewRound,
} from "@/lib/client/backend-api";

/**
 * 公开访问入口（无需登录）—— 与 studio 后台同一份候选人 / 面试详情数据，但所有
 * 请求落到 `/public/*`，端点参数里不再带 slug。任何写操作都不在此暴露。
 *
 * Public-access endpoints (no auth required). Mirrors the studio admin shape
 * for candidate / round detail, but routes to `/public/*` and drops the
 * slug parameter. No mutations are exposed here.
 */

import type { CandidateFormSubmissionWithSnapshot } from "@arc/db-schema/candidate-forms";
import type { StudioInterviewConversationReport } from "@arc/db-schema/interview-session";
import type {
  StudioInterviewRoundDetail,
  StudioInterviewRoundListRecord,
} from "@arc/shared/studio-interview-rounds";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";

import { apiRequest } from "../rpc-fetch";

export function resolvePublicInterviewRecordId(recordId: string): Promise<string | null> {
  return apiRequest(
    resolvePublicInterviewRound({
      query: { id: recordId },
    }),
    "解析面试链接失败",
    { allow404: true },
  ).then((data) => data?.roundId ?? null);
}

export function fetchPublicInterviewRound(
  roundId: string,
): Promise<StudioInterviewRoundDetail | null> {
  return apiRequest(getPublicInterviewRound({ path: { id: roundId } }), "加载面试详情失败", {
    allow404: true,
  });
}

export function fetchPublicInterviewRoundReports(
  roundId: string,
): Promise<StudioInterviewConversationReport[]> {
  return apiRequest<StudioInterviewConversationReport[]>(
    listPublicInterviewRoundReports({ path: { id: roundId } }),
    "加载面试报告失败",
  );
}

export function fetchPublicInterviewRoundReport(
  roundId: string,
  conversationId: string,
): Promise<StudioInterviewConversationReport | null> {
  return apiRequest(
    getPublicInterviewRoundReport({ path: { conversationId, id: roundId } }),

    "加载面试记录失败",
    { allow404: true },
  );
}

export function fetchPublicInterviewRecordingUrl(
  roundId: string,
  conversationId: string,
): Promise<{ url: string; expiresInSeconds: number }> {
  return apiRequest(
    getPublicInterviewRoundRecording({ path: { conversationId, id: roundId } }),

    "加载录像链接失败",
  );
}

export async function fetchPublicInterviewRoundFormSubmissions(
  roundId: string,
): Promise<CandidateFormSubmissionWithSnapshot[]> {
  const data = await apiRequest(
    listPublicInterviewRoundFormSubmissions({ path: { id: roundId } }),
    "加载面试表单填写失败",
  );
  return data.submissions;
}

export function fetchPublicResume(candidateId: string): Promise<ResumeLibraryDetail | null> {
  return apiRequest(getPublicResume({ path: { id: candidateId } }), "加载候选人详情失败", {
    allow404: true,
  });
}

export function fetchPublicResumeRounds(
  candidateId: string,
): Promise<StudioInterviewRoundListRecord[]> {
  return apiRequest(listPublicResumeRounds({ path: { id: candidateId } }), "加载面试轮次失败");
}
