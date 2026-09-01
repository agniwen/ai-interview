import {
  backendApiUrl,
  getPublicHumanInterviewCandidateAiEvaluation,
  getPublicHumanInterviewCandidateHrInformation,
  getPublicHumanInterviewCandidateMaterial,
  getPublicHumanInterviewCandidateQuestions,
  listPublicHumanInterviewCandidateMaterials,
} from "@/lib/client/backend-api";
import type {
  HumanInterviewCandidateAiEvaluationResponse,
  HumanInterviewCandidateHrInformationResponse,
  HumanInterviewCandidateMaterialListResponse,
  HumanInterviewCandidateOverviewResponse,
  HumanInterviewCandidateQuestionsResponse,
} from "@arc/shared/human-interview-candidate-materials";

import { apiRequest } from "../rpc-fetch";

export function fetchHumanInterviewCandidateMaterials(
  inviteToken: string,
): Promise<HumanInterviewCandidateMaterialListResponse> {
  return apiRequest(
    listPublicHumanInterviewCandidateMaterials({ path: { inviteToken } }),

    "加载候选人列表失败",
  );
}

export function fetchHumanInterviewCandidateMaterialDetail(
  inviteToken: string,
  candidateId: string,
): Promise<HumanInterviewCandidateOverviewResponse> {
  return apiRequest(
    getPublicHumanInterviewCandidateMaterial({ path: { candidateId, inviteToken } }),

    "加载候选人资料失败",
  );
}

export function fetchHumanInterviewCandidateAiEvaluation(
  inviteToken: string,
  candidateId: string,
): Promise<HumanInterviewCandidateAiEvaluationResponse> {
  return apiRequest(
    getPublicHumanInterviewCandidateAiEvaluation({ path: { candidateId, inviteToken } }),
    "加载 AI 评价失败",
  );
}

export function fetchHumanInterviewCandidateHrInformation(
  inviteToken: string,
  candidateId: string,
): Promise<HumanInterviewCandidateHrInformationResponse> {
  return apiRequest(
    getPublicHumanInterviewCandidateHrInformation({ path: { candidateId, inviteToken } }),
    "加载 HR 初面信息失败",
  );
}

export function fetchHumanInterviewCandidateQuestions(
  inviteToken: string,
  candidateId: string,
): Promise<HumanInterviewCandidateQuestionsResponse> {
  return apiRequest(
    getPublicHumanInterviewCandidateQuestions({ path: { candidateId, inviteToken } }),
    "加载面试题参考失败",
  );
}

export function getHumanInterviewCandidateResumeUrl(inviteToken: string, candidateId: string) {
  return backendApiUrl(
    `/public/human-interviews/candidate-materials/${encodeURIComponent(
      inviteToken,
    )}/${encodeURIComponent(candidateId)}/resume`,
  );
}

export function getHumanInterviewCandidatePptxPreviewUrl(inviteToken: string, candidateId: string) {
  return backendApiUrl(
    `/public/human-interviews/candidate-materials/${encodeURIComponent(
      inviteToken,
    )}/${encodeURIComponent(candidateId)}/resume-preview.pdf`,
  );
}
