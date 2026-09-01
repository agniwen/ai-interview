import type { Request } from "express";
import type { z } from "zod";
import type { TopLevelBinaryResponse, TopLevelResponse } from "../top-level.ports.js";
import type { invitationResponseSchema } from "./public.schemas.js";

export const TOP_LEVEL_PUBLIC_PORT = Symbol("TOP_LEVEL_PUBLIC_PORT");

export interface TopLevelPublicPort {
  createCandidateMeetingLiveKitToken(inviteToken: string): Promise<TopLevelResponse>;
  createInterviewerMeetingLiveKitToken(inviteToken: string): Promise<TopLevelResponse>;
  endInterviewerMeeting(inviteToken: string): Promise<{ ok: true }>;
  getAiInterviewInvitation(token: string): Promise<TopLevelResponse>;
  getCandidateMaterial(input: {
    candidateId: string;
    inviteToken: string;
  }): Promise<TopLevelResponse>;
  getCandidateMaterialAiEvaluation(input: {
    candidateId: string;
    inviteToken: string;
  }): Promise<TopLevelResponse>;
  getCandidateMaterialHrInformation(input: {
    candidateId: string;
    inviteToken: string;
  }): Promise<TopLevelResponse>;
  getCandidateMaterialQuestions(input: {
    candidateId: string;
    inviteToken: string;
  }): Promise<TopLevelResponse>;
  getCandidateMaterialResume(input: {
    candidateId: string;
    inviteToken: string;
  }): Promise<TopLevelBinaryResponse>;
  getCandidateMaterialResumePreview(input: {
    candidateId: string;
    inviteToken: string;
  }): Promise<TopLevelBinaryResponse>;
  getCandidateMeeting(inviteToken: string): Promise<TopLevelResponse>;
  getInterviewerMeeting(inviteToken: string): Promise<TopLevelResponse>;
  getReferral(token: string): Promise<TopLevelResponse>;
  getResume(id: string): Promise<TopLevelResponse>;
  getRound(id: string): Promise<TopLevelResponse>;
  getRoundFormSubmissions(id: string): Promise<TopLevelResponse>;
  getRoundRecording(input: { conversationId: string; id: string }): Promise<TopLevelResponse>;
  getRoundReport(input: { conversationId: string; id: string }): Promise<TopLevelResponse>;
  getRoundReports(id: string): Promise<TopLevelResponse>;
  getRoundResume(id: string): Promise<TopLevelBinaryResponse>;
  getRoundResumePreview(id: string): Promise<TopLevelBinaryResponse>;
  getVoicePreview(id: string): Promise<TopLevelBinaryResponse>;
  listCandidateMaterials(inviteToken: string): Promise<TopLevelResponse>;
  listResumeRounds(id: string): Promise<TopLevelResponse>;
  resolveRound(id: string): Promise<{ roundId: string }>;
  respondAiInterviewInvitation(input: {
    body: z.infer<typeof invitationResponseSchema>;
    token: string;
  }): Promise<TopLevelResponse>;
  respondCandidateMeetingInvitation(input: {
    body: z.infer<typeof invitationResponseSchema>;
    inviteToken: string;
  }): Promise<TopLevelResponse>;
  uploadReferralResume(input: { request: Request; token: string }): Promise<TopLevelResponse>;
}
