import type { Request } from "express";
import type { z } from "zod";
import type {
  HttpBinaryResponse,
  HttpResponse,
} from "../../../../infrastructure/http/http.ports.js";
import type { invitationResponseSchema } from "./public.schemas.js";

export const PUBLIC_RECRUITING_PORT = Symbol("PUBLIC_RECRUITING_PORT");

export interface PublicRecruitingPort {
  createCandidateMeetingLiveKitToken(inviteToken: string): Promise<HttpResponse>;
  createInterviewerMeetingLiveKitToken(inviteToken: string): Promise<HttpResponse>;
  endInterviewerMeeting(inviteToken: string): Promise<{ ok: true }>;
  getAiInterviewInvitation(token: string): Promise<HttpResponse>;
  getCandidateMaterial(input: { candidateId: string; inviteToken: string }): Promise<HttpResponse>;
  getCandidateMaterialAiEvaluation(input: {
    candidateId: string;
    inviteToken: string;
  }): Promise<HttpResponse>;
  getCandidateMaterialHrInformation(input: {
    candidateId: string;
    inviteToken: string;
  }): Promise<HttpResponse>;
  getCandidateMaterialQuestions(input: {
    candidateId: string;
    inviteToken: string;
  }): Promise<HttpResponse>;
  getCandidateMaterialResume(input: {
    candidateId: string;
    inviteToken: string;
  }): Promise<HttpBinaryResponse>;
  getCandidateMaterialResumePreview(input: {
    candidateId: string;
    inviteToken: string;
  }): Promise<HttpBinaryResponse>;
  getCandidateMeeting(inviteToken: string): Promise<HttpResponse>;
  getInterviewerMeeting(inviteToken: string): Promise<HttpResponse>;
  getReferral(token: string): Promise<HttpResponse>;
  getResume(id: string): Promise<HttpResponse>;
  getRound(id: string): Promise<HttpResponse>;
  getRoundFormSubmissions(id: string): Promise<HttpResponse>;
  getRoundRecording(input: { conversationId: string; id: string }): Promise<HttpResponse>;
  getRoundReport(input: { conversationId: string; id: string }): Promise<HttpResponse>;
  getRoundReports(id: string): Promise<HttpResponse>;
  getRoundResume(id: string): Promise<HttpBinaryResponse>;
  getRoundResumePreview(id: string): Promise<HttpBinaryResponse>;
  listCandidateMaterials(inviteToken: string): Promise<HttpResponse>;
  listResumeRounds(id: string): Promise<HttpResponse>;
  resolveRound(id: string): Promise<{ roundId: string }>;
  respondAiInterviewInvitation(input: {
    body: z.infer<typeof invitationResponseSchema>;
    token: string;
  }): Promise<HttpResponse>;
  respondCandidateMeetingInvitation(input: {
    body: z.infer<typeof invitationResponseSchema>;
    inviteToken: string;
  }): Promise<HttpResponse>;
  uploadReferralResume(input: { request: Request; token: string }): Promise<HttpResponse>;
}
