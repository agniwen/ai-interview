import type {
  HumanInterviewCandidateAiEvaluationResponse,
  HumanInterviewCandidateHrInformationResponse,
  HumanInterviewCandidateMaterialListResponse,
  HumanInterviewCandidateOverviewResponse,
  HumanInterviewCandidateQuestionsResponse,
} from "@app/shared/human-interview-candidate-materials";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "../rpc-fetch";

export function fetchHumanInterviewCandidateMaterials(
  inviteToken: string,
): Promise<HumanInterviewCandidateMaterialListResponse> {
  return rpcFetch(
    rpc.api.public["human-interview-candidate-materials"][":inviteToken"].$get({
      param: { inviteToken },
    }),
    "加载候选人列表失败",
  );
}

export function fetchHumanInterviewCandidateMaterialDetail(
  inviteToken: string,
  candidateId: string,
): Promise<HumanInterviewCandidateOverviewResponse> {
  return rpcFetch(
    rpc.api.public["human-interview-candidate-materials"][":inviteToken"][":candidateId"].$get({
      param: { candidateId, inviteToken },
    }),
    "加载候选人资料失败",
  );
}

export function fetchHumanInterviewCandidateAiEvaluation(
  inviteToken: string,
  candidateId: string,
): Promise<HumanInterviewCandidateAiEvaluationResponse> {
  return rpcFetch(
    rpc.api.public["human-interview-candidate-materials"][":inviteToken"][":candidateId"][
      "ai-evaluation"
    ].$get({ param: { candidateId, inviteToken } }),
    "加载 AI 评价失败",
  );
}

export function fetchHumanInterviewCandidateHrInformation(
  inviteToken: string,
  candidateId: string,
): Promise<HumanInterviewCandidateHrInformationResponse> {
  return rpcFetch(
    rpc.api.public["human-interview-candidate-materials"][":inviteToken"][":candidateId"][
      "hr-initial-information"
    ].$get({ param: { candidateId, inviteToken } }),
    "加载 HR 初面信息失败",
  );
}

export function fetchHumanInterviewCandidateQuestions(
  inviteToken: string,
  candidateId: string,
): Promise<HumanInterviewCandidateQuestionsResponse> {
  return rpcFetch(
    rpc.api.public["human-interview-candidate-materials"][":inviteToken"][":candidateId"][
      "interview-questions"
    ].$get({ param: { candidateId, inviteToken } }),
    "加载面试题参考失败",
  );
}

export function getHumanInterviewCandidateResumeUrl(inviteToken: string, candidateId: string) {
  return `/api/public/human-interview-candidate-materials/${encodeURIComponent(
    inviteToken,
  )}/${encodeURIComponent(candidateId)}/resume`;
}

export function getHumanInterviewCandidatePptxPreviewUrl(inviteToken: string, candidateId: string) {
  return `/api/public/human-interview-candidate-materials/${encodeURIComponent(
    inviteToken,
  )}/${encodeURIComponent(candidateId)}/resume-preview.pdf`;
}
