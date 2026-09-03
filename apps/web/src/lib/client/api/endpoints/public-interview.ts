/**
 * 公开访问入口（无需登录）—— 与 studio 后台同一份候选人 / 面试详情数据，但所有
 * 请求落到 `/api/public/*`，端点参数里不再带 slug。任何写操作都不在此暴露。
 *
 * Public-access endpoints (no auth required). Mirrors the studio admin shape
 * for candidate / round detail, but routes to `/api/public/*` and drops the
 * slug parameter. No mutations are exposed here.
 */

import type { CandidateFormSubmissionWithSnapshot } from "@app/db-schema/candidate-forms";
import type { StudioInterviewConversationReport } from "@app/db-schema/interview-session";
import type {
  StudioInterviewRoundDetail,
  StudioInterviewRoundListRecord,
} from "@app/shared/studio-interview-rounds";
import type { ResumeLibraryDetail } from "@app/shared/studio-resumes";
import { publicRpc } from "@/lib/client/rpc";
import { rpcFetch, rpcFetchAs } from "../rpc-fetch";

export function resolvePublicInterviewRecordId(recordId: string): Promise<string | null> {
  return rpcFetch(
    publicRpc["interview-rounds"].resolve.$get({ query: { id: recordId } }),
    "解析面试链接失败",
    { allow404: true },
  ).then((data) => data?.roundId ?? null);
}

export function fetchPublicInterviewRound(
  roundId: string,
): Promise<StudioInterviewRoundDetail | null> {
  return rpcFetch(
    publicRpc["interview-rounds"][":id"].$get({ param: { id: roundId } }),
    "加载面试详情失败",
    { allow404: true },
  );
}

export function fetchPublicInterviewRoundReports(
  roundId: string,
): Promise<StudioInterviewConversationReport[]> {
  return rpcFetchAs<StudioInterviewConversationReport[]>(
    publicRpc["interview-rounds"][":id"].reports.$get({ param: { id: roundId } }),
    "加载面试报告失败",
  );
}

export function fetchPublicInterviewRoundReport(
  roundId: string,
  conversationId: string,
): Promise<StudioInterviewConversationReport | null> {
  return rpcFetchAs<StudioInterviewConversationReport>(
    publicRpc["interview-rounds"][":id"].reports[":conversationId"].$get({
      param: { conversationId, id: roundId },
    }),
    "加载面试记录失败",
    { allow404: true },
  );
}

export function fetchPublicInterviewRecordingUrl(
  roundId: string,
  conversationId: string,
): Promise<{ url: string; expiresInSeconds: number }> {
  return rpcFetchAs<{ expiresInSeconds: number; url: string }>(
    publicRpc["interview-rounds"][":id"].recordings[":conversationId"].$get({
      param: { conversationId, id: roundId },
    }),
    "加载录像链接失败",
  );
}

export async function fetchPublicInterviewRoundFormSubmissions(
  roundId: string,
): Promise<CandidateFormSubmissionWithSnapshot[]> {
  const data = await rpcFetch(
    publicRpc["interview-rounds"][":id"]["form-submissions"].$get({ param: { id: roundId } }),
    "加载面试表单填写失败",
  );
  return data.submissions;
}

export function fetchPublicResume(candidateId: string): Promise<ResumeLibraryDetail | null> {
  return rpcFetch(
    publicRpc.resumes[":id"].$get({ param: { id: candidateId } }),
    "加载候选人详情失败",
    { allow404: true },
  );
}

export function fetchPublicResumeRounds(
  candidateId: string,
): Promise<StudioInterviewRoundListRecord[]> {
  return rpcFetch(
    publicRpc.resumes[":id"].rounds.$get({ param: { id: candidateId } }),
    "加载面试轮次失败",
  );
}
