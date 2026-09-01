/* oxlint-disable max-classes-per-file -- The public invitation and material controllers share one public API boundary while retaining distinct route prefixes. */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  SerializeOptions,
} from "@nestjs/common";
import { ApiConsumes, ApiOperation, ApiProduces, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import type { z } from "zod";
import { sendTopLevelBinaryResponse } from "../binary-response.js";
import { identifierSchema, jsonResponseSchema, okResponseSchema } from "../shared.schemas.js";
import { TOP_LEVEL_PUBLIC_PORT } from "./public.port.js";
import type { TopLevelPublicPort } from "./public.port.js";
import {
  invitationResponseSchema,
  publicRoundResolveQuerySchema,
  publicRoundResolveResponseSchema,
} from "./public.schemas.js";

const binarySchema = { format: "binary", type: "string" } as const;
const audioResponseContent = {
  "application/octet-stream": { schema: binarySchema },
  "audio/mpeg": { schema: binarySchema },
  "audio/wav": { schema: binarySchema },
};
const resumeResponseContent = {
  "application/octet-stream": { schema: binarySchema },
  "application/pdf": { schema: binarySchema },
};
const pdfResponseContent = { "application/pdf": { schema: binarySchema } };

@ApiTags("public")
@Controller("api/public")
export class PublicController {
  constructor(
    @Inject(TOP_LEVEL_PUBLIC_PORT)
    private readonly publicApi: TopLevelPublicPort,
  ) {}

  @Get("referrals/:token")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "getPublicReferral" })
  @ApiResponse({ status: 200 })
  referral(@Param("token", { schema: identifierSchema }) token: string) {
    return this.publicApi.getReferral(token);
  }

  @Post("referrals/:token/resumes")
  @ApiConsumes("multipart/form-data")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "uploadPublicReferralResume" })
  @ApiResponse({ status: 201 })
  uploadReferralResume(
    @Param("token", { schema: identifierSchema }) token: string,
    @Req() request: Request,
  ) {
    return this.publicApi.uploadReferralResume({ request, token });
  }

  @Get("minimax-voice-previews/:id")
  @ApiProduces("audio/mpeg", "audio/wav", "application/octet-stream")
  @ApiOperation({ operationId: "getPublicMinimaxVoicePreview" })
  @ApiResponse({ content: audioResponseContent, status: 200 })
  async voicePreview(
    @Param("id", { schema: identifierSchema }) id: string,
    @Res() response: Response,
  ) {
    sendTopLevelBinaryResponse(response, await this.publicApi.getVoicePreview(id));
  }

  @Get("ai-interview-invitations/:token")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "getPublicAiInterviewInvitation" })
  @ApiResponse({ status: 200 })
  aiInterviewInvitation(@Param("token", { schema: identifierSchema }) token: string) {
    return this.publicApi.getAiInterviewInvitation(token);
  }

  @Post("ai-interview-invitations/:token/respond")
  @HttpCode(200)
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "respondPublicAiInterviewInvitation" })
  @ApiResponse({ status: 200 })
  respondAiInterviewInvitation(
    @Param("token", { schema: identifierSchema }) token: string,
    @Body({ schema: invitationResponseSchema }) body: z.infer<typeof invitationResponseSchema>,
  ) {
    return this.publicApi.respondAiInterviewInvitation({ body, token });
  }

  @Get("human-interview-meetings/interviewer/:inviteToken")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "getPublicInterviewerMeeting" })
  @ApiResponse({ status: 200 })
  interviewerMeeting(@Param("inviteToken", { schema: identifierSchema }) inviteToken: string) {
    return this.publicApi.getInterviewerMeeting(inviteToken);
  }

  @Post("human-interview-meetings/interviewer/:inviteToken/livekit-token")
  @HttpCode(200)
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "createPublicInterviewerMeetingLiveKitToken" })
  @ApiResponse({ status: 200 })
  interviewerMeetingLiveKitToken(
    @Param("inviteToken", { schema: identifierSchema }) inviteToken: string,
  ) {
    return this.publicApi.createInterviewerMeetingLiveKitToken(inviteToken);
  }

  @Post("human-interview-meetings/interviewer/:inviteToken/end")
  @HttpCode(200)
  @SerializeOptions({ schema: okResponseSchema })
  @ApiOperation({ operationId: "endPublicInterviewerMeeting" })
  @ApiResponse({ status: 200 })
  endInterviewerMeeting(@Param("inviteToken", { schema: identifierSchema }) inviteToken: string) {
    return this.publicApi.endInterviewerMeeting(inviteToken);
  }

  @Get("human-interview-meetings/:inviteToken")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "getPublicCandidateMeeting" })
  @ApiResponse({ status: 200 })
  candidateMeeting(@Param("inviteToken", { schema: identifierSchema }) inviteToken: string) {
    return this.publicApi.getCandidateMeeting(inviteToken);
  }

  @Post("human-interview-meetings/:inviteToken/respond")
  @HttpCode(200)
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "respondPublicCandidateMeetingInvitation" })
  @ApiResponse({ status: 200 })
  respondCandidateMeetingInvitation(
    @Param("inviteToken", { schema: identifierSchema }) inviteToken: string,
    @Body({ schema: invitationResponseSchema }) body: z.infer<typeof invitationResponseSchema>,
  ) {
    return this.publicApi.respondCandidateMeetingInvitation({ body, inviteToken });
  }

  @Post("human-interview-meetings/:inviteToken/livekit-token")
  @HttpCode(200)
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "createPublicCandidateMeetingLiveKitToken" })
  @ApiResponse({ status: 200 })
  candidateMeetingLiveKitToken(
    @Param("inviteToken", { schema: identifierSchema }) inviteToken: string,
  ) {
    return this.publicApi.createCandidateMeetingLiveKitToken(inviteToken);
  }

  @Get("interview-rounds/resolve")
  @SerializeOptions({ schema: publicRoundResolveResponseSchema })
  @ApiOperation({ operationId: "resolvePublicInterviewRound" })
  @ApiResponse({ status: 200 })
  resolveRound(
    @Query({ schema: publicRoundResolveQuerySchema })
    query: z.infer<typeof publicRoundResolveQuerySchema>,
  ) {
    return this.publicApi.resolveRound(query.id);
  }

  @Get("interview-rounds/:id")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "getPublicInterviewRound" })
  @ApiResponse({ status: 200 })
  round(@Param("id", { schema: identifierSchema }) id: string) {
    return this.publicApi.getRound(id);
  }

  @Get("interview-rounds/:id/reports")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "listPublicInterviewRoundReports" })
  @ApiResponse({ status: 200 })
  roundReports(@Param("id", { schema: identifierSchema }) id: string) {
    return this.publicApi.getRoundReports(id);
  }

  @Get("interview-rounds/:id/reports/:conversationId")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "getPublicInterviewRoundReport" })
  @ApiResponse({ status: 200 })
  roundReport(
    @Param("id", { schema: identifierSchema }) id: string,
    @Param("conversationId", { schema: identifierSchema }) conversationId: string,
  ) {
    return this.publicApi.getRoundReport({ conversationId, id });
  }

  @Get("interview-rounds/:id/form-submissions")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "listPublicInterviewRoundFormSubmissions" })
  @ApiResponse({ status: 200 })
  roundFormSubmissions(@Param("id", { schema: identifierSchema }) id: string) {
    return this.publicApi.getRoundFormSubmissions(id);
  }

  @Get("interview-rounds/:id/recordings/:conversationId")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "getPublicInterviewRoundRecording" })
  @ApiResponse({ status: 200 })
  roundRecording(
    @Param("id", { schema: identifierSchema }) id: string,
    @Param("conversationId", { schema: identifierSchema }) conversationId: string,
  ) {
    return this.publicApi.getRoundRecording({ conversationId, id });
  }

  @Get("interview-rounds/:id/resume")
  @ApiProduces("application/pdf", "application/octet-stream")
  @ApiOperation({ operationId: "getPublicInterviewRoundResume" })
  @ApiResponse({ content: resumeResponseContent, status: 200 })
  async roundResume(
    @Param("id", { schema: identifierSchema }) id: string,
    @Res() response: Response,
  ) {
    sendTopLevelBinaryResponse(response, await this.publicApi.getRoundResume(id));
  }

  @Get("interview-rounds/:id/resume-preview.pdf")
  @ApiProduces("application/pdf")
  @ApiOperation({ operationId: "getPublicInterviewRoundResumePreview" })
  @ApiResponse({ content: pdfResponseContent, status: 200 })
  async roundResumePreview(
    @Param("id", { schema: identifierSchema }) id: string,
    @Res() response: Response,
  ) {
    sendTopLevelBinaryResponse(response, await this.publicApi.getRoundResumePreview(id));
  }

  @Get("resumes/:id")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "getPublicResume" })
  @ApiResponse({ status: 200 })
  resume(@Param("id", { schema: identifierSchema }) id: string) {
    return this.publicApi.getResume(id);
  }

  @Get("resumes/:id/rounds")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "listPublicResumeRounds" })
  @ApiResponse({ status: 200 })
  resumeRounds(@Param("id", { schema: identifierSchema }) id: string) {
    return this.publicApi.listResumeRounds(id);
  }
}

@ApiTags("public-human-interview-materials")
@Controller("api/public/human-interview-candidate-materials")
export class PublicHumanInterviewCandidateMaterialsController {
  constructor(
    @Inject(TOP_LEVEL_PUBLIC_PORT)
    private readonly publicApi: TopLevelPublicPort,
  ) {}

  @Get(":inviteToken")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "listPublicHumanInterviewCandidateMaterials" })
  @ApiResponse({ status: 200 })
  list(@Param("inviteToken", { schema: identifierSchema }) inviteToken: string) {
    return this.publicApi.listCandidateMaterials(inviteToken);
  }

  @Get(":inviteToken/:candidateId")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "getPublicHumanInterviewCandidateMaterial" })
  @ApiResponse({ status: 200 })
  detail(
    @Param("inviteToken", { schema: identifierSchema }) inviteToken: string,
    @Param("candidateId", { schema: identifierSchema }) candidateId: string,
  ) {
    return this.publicApi.getCandidateMaterial({ candidateId, inviteToken });
  }

  @Get(":inviteToken/:candidateId/ai-evaluation")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "getPublicHumanInterviewCandidateAiEvaluation" })
  @ApiResponse({ status: 200 })
  aiEvaluation(
    @Param("inviteToken", { schema: identifierSchema }) inviteToken: string,
    @Param("candidateId", { schema: identifierSchema }) candidateId: string,
  ) {
    return this.publicApi.getCandidateMaterialAiEvaluation({ candidateId, inviteToken });
  }

  @Get(":inviteToken/:candidateId/hr-initial-information")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "getPublicHumanInterviewCandidateHrInformation" })
  @ApiResponse({ status: 200 })
  hrInformation(
    @Param("inviteToken", { schema: identifierSchema }) inviteToken: string,
    @Param("candidateId", { schema: identifierSchema }) candidateId: string,
  ) {
    return this.publicApi.getCandidateMaterialHrInformation({ candidateId, inviteToken });
  }

  @Get(":inviteToken/:candidateId/interview-questions")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "getPublicHumanInterviewCandidateQuestions" })
  @ApiResponse({ status: 200 })
  questions(
    @Param("inviteToken", { schema: identifierSchema }) inviteToken: string,
    @Param("candidateId", { schema: identifierSchema }) candidateId: string,
  ) {
    return this.publicApi.getCandidateMaterialQuestions({ candidateId, inviteToken });
  }

  @Get(":inviteToken/:candidateId/resume")
  @ApiProduces("application/pdf", "application/octet-stream")
  @ApiOperation({ operationId: "getPublicHumanInterviewCandidateResume" })
  @ApiResponse({ content: resumeResponseContent, status: 200 })
  async resume(
    @Param("inviteToken", { schema: identifierSchema }) inviteToken: string,
    @Param("candidateId", { schema: identifierSchema }) candidateId: string,
    @Res() response: Response,
  ) {
    const payload = await this.publicApi.getCandidateMaterialResume({
      candidateId,
      inviteToken,
    });
    sendTopLevelBinaryResponse(response, payload);
  }

  @Get(":inviteToken/:candidateId/resume-preview.pdf")
  @ApiProduces("application/pdf")
  @ApiOperation({ operationId: "getPublicHumanInterviewCandidateResumePreview" })
  @ApiResponse({ content: pdfResponseContent, status: 200 })
  async resumePreview(
    @Param("inviteToken", { schema: identifierSchema }) inviteToken: string,
    @Param("candidateId", { schema: identifierSchema }) candidateId: string,
    @Res() response: Response,
  ) {
    const payload = await this.publicApi.getCandidateMaterialResumePreview({
      candidateId,
      inviteToken,
    });
    sendTopLevelBinaryResponse(response, payload);
  }
}
