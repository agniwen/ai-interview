/* oxlint-disable max-classes-per-file, typescript/consistent-type-imports -- Closely related route-prefix controllers share one interview workflow contract and service boundary; injected classes must remain runtime imports for Nest metadata. */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Injectable,
  ForbiddenException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  SerializeOptions,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiMultipartBody } from "../../../../openapi/api-multipart-body.js";
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import type { UploadedResumeFile } from "../../intake/upload-batches/resume-upload-batch.service.js";
import {
  WORKSPACE_ACCESS_PORT,
  RequireWorkspacePermission,
  WorkspaceAccessGuard,
  getWorkspaceContext,
} from "../../../../infrastructure/http/workspace-access/index.js";
import type { WorkspaceAccessPort } from "../../../../infrastructure/http/workspace-access/index.js";
import { InterviewCoreService } from "./interview-core.service.js";
import {
  bindingsInputSchema,
  bulkInterviewDeleteSchema,
  candidateExpectationsPatchSchema,
  candidateExpectationsResponseSchema,
  cancelHumanRoundSchema,
  completeHumanRoundSchema,
  createOfferDraftSchema,
  contextSnapshotResponseSchema,
  formSubmissionDeleteResponseSchema,
  formSubmissionsResponseSchema,
  humanInterviewMeetingInputSchema,
  humanInterviewMeetingScheduleUpdateSchema,
  humanInterviewRoundInputSchema,
  humanMeetingTokenInputSchema,
  humanMeetingLinksResponseSchema,
  humanMeetingResponseSchema,
  humanMeetingsResponseSchema,
  interviewAgentInstructionsResponseSchema,
  interviewChildPathSchema,
  interviewCreateMultipartSchema,
  interviewDetailResponseSchema,
  interviewEvaluationDocumentResponseSchema,
  interviewIdPathSchema,
  interviewListQuerySchema,
  interviewRoundPatchSchema,
  interviewReportSchema,
  interviewReportsSchema,
  interviewResolveResponseSchema,
  meetingListQuerySchema,
  meetingPathSchema,
  meetingTokenResponseSchema,
  offerDraftInputSchema,
  offerDraftPathSchema,
  offerRecordSchema,
  offerResponseInputSchema,
  paginatedInterviewsSchema,
  questionTemplateBindingsSchema,
  recipientInputSchema,
  recipientsResponseSchema,
  recordingLinkSchema,
  recordPathSchema,
  resolveInterviewQuerySchema,
  roundDeleteResponseSchema,
  roundEmailPathSchema,
  roundEmailSendResponseSchema,
  roundEmailSummaryResponseSchema,
  roundEmailSummaryQuerySchema,
  submissionPathSchema,
  successSchema,
  transitionInputSchema,
  humanRoundPathSchema,
  humanRoundRecordSchema,
} from "./interview-workflow.schemas.js";
import { InterviewWorkflowService } from "./interview-workflow.service.js";

type IdPath = z.infer<typeof interviewIdPathSchema>;
type ChildPath = z.infer<typeof interviewChildPathSchema>;
type SubmissionPath = z.infer<typeof submissionPathSchema>;
type HumanRoundPath = z.infer<typeof humanRoundPathSchema>;
type OfferPath = z.infer<typeof offerDraftPathSchema>;
type MeetingPath = z.infer<typeof meetingPathSchema>;
type RecordPath = z.infer<typeof recordPathSchema>;
type RoundEmailPath = z.infer<typeof roundEmailPathSchema>;
type ListQuery = z.infer<typeof interviewListQuerySchema>;
type CreateInput = z.infer<typeof interviewCreateMultipartSchema>;

@Injectable()
abstract class InterviewControllerBase {
  constructor(
    protected readonly core: InterviewCoreService,
    protected readonly workflows: InterviewWorkflowService,
  ) {}

  protected async requestContext(request: Request) {
    const context = getWorkspaceContext(request);
    const visible = await this.core.visibleCreatorIds(
      context.workspace.id,
      context.actor.id,
      context.member.role,
    );
    return { context, visible };
  }
}

@ApiTags("workspace-interviews")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/studio/interviews")
export class InterviewCollectionController extends InterviewControllerBase {
  @Get()
  @ApiOperation({ operationId: "listWorkspaceInterviews" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: paginatedInterviewsSchema })
  @RequireWorkspacePermission("interview", "read")
  async list(
    @Req() request: Request,
    @Query({ schema: interviewListQuerySchema }) query: ListQuery,
  ) {
    const { context, visible } = await this.requestContext(request);
    return this.workflows.list(context.workspace.id, visible, query);
  }

  @Post()
  @UseInterceptors(FileInterceptor("resume"))
  @ApiConsumes("multipart/form-data")
  @ApiMultipartBody({ fileField: "resume", schema: interviewCreateMultipartSchema })
  @ApiOperation({ operationId: "createWorkspaceInterview" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: interviewDetailResponseSchema })
  @RequireWorkspacePermission("interview", "create")
  create(
    @Req() request: Request,
    @Body({ schema: interviewCreateMultipartSchema }) body: CreateInput,
    @UploadedFile() file?: UploadedResumeFile,
  ) {
    const context = getWorkspaceContext(request);
    return this.workflows.create(context.workspace.id, context.actor.id, body, file);
  }

  @Get("resolve")
  @ApiOperation({ operationId: "resolveWorkspaceInterview" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: interviewResolveResponseSchema })
  @RequireWorkspacePermission("interview", "read")
  async resolve(
    @Req() request: Request,
    @Query({ schema: resolveInterviewQuerySchema }) query: z.infer<
      typeof resolveInterviewQuerySchema
    >,
  ) {
    const { context, visible } = await this.requestContext(request);
    return this.workflows.resolve(context.workspace.id, query.id, visible);
  }

  @Post("bulk-delete")
  @HttpCode(200)
  @ApiOperation({ operationId: "bulkDeleteWorkspaceInterviews" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: roundDeleteResponseSchema })
  @RequireWorkspacePermission("interview", "delete")
  bulkDelete(
    @Req() request: Request,
    @Body({ schema: bulkInterviewDeleteSchema }) body: z.infer<typeof bulkInterviewDeleteSchema>,
  ) {
    return this.workflows.bulkRemoveRounds(getWorkspaceContext(request).workspace.id, body);
  }

  @Delete(":id")
  @HttpCode(200)
  @ApiOperation({ operationId: "deleteWorkspaceInterviewRound" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: successSchema })
  @RequireWorkspacePermission("interview", "delete")
  remove(@Req() request: Request, @Param({ schema: interviewIdPathSchema }) path: IdPath) {
    const context = getWorkspaceContext(request);
    return this.workflows.removeRound(context.workspace.id, context.actor.id, path.id);
  }
}

@ApiTags("workspace-interviews")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/studio/interviews/:id")
export class InterviewDetailController extends InterviewControllerBase {
  constructor(
    core: InterviewCoreService,
    workflows: InterviewWorkflowService,
    @Inject(WORKSPACE_ACCESS_PORT) private readonly access: WorkspaceAccessPort,
  ) {
    super(core, workflows);
  }

  @Post("evaluation-document")
  @HttpCode(200)
  @ApiOperation({ operationId: "createWorkspaceInterviewEvaluationDocument" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: interviewEvaluationDocumentResponseSchema })
  @RequireWorkspacePermission("interview", "update")
  evaluationDocument(
    @Req() request: Request,
    @Param({ schema: interviewIdPathSchema }) path: IdPath,
  ) {
    return this.workflows.evaluationDocument(getWorkspaceContext(request).workspace.id, path.id);
  }

  @Get()
  @ApiOperation({ operationId: "getWorkspaceInterview" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: interviewDetailResponseSchema })
  @RequireWorkspacePermission("interview", "read")
  async get(@Req() request: Request, @Param({ schema: interviewIdPathSchema }) path: IdPath) {
    const { context, visible } = await this.requestContext(request);
    return this.workflows.detail(context.workspace.id, path.id, visible);
  }

  @Get("agent-instructions")
  @ApiOperation({ operationId: "getWorkspaceInterviewAgentInstructions" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: interviewAgentInstructionsResponseSchema })
  @RequireWorkspacePermission("interview", "read")
  instructions(@Req() request: Request, @Param({ schema: interviewIdPathSchema }) path: IdPath) {
    return this.workflows.agentInstructions(getWorkspaceContext(request).workspace.id, path.id);
  }

  @Get("reports")
  @ApiOperation({ operationId: "listWorkspaceInterviewReports" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: interviewReportsSchema })
  @RequireWorkspacePermission("interview", "read")
  reports(@Req() request: Request, @Param({ schema: interviewIdPathSchema }) path: IdPath) {
    return this.workflows.reports(getWorkspaceContext(request).workspace.id, path.id);
  }

  @Get("reports/:conversationId")
  @ApiOperation({ operationId: "getWorkspaceInterviewReport" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: interviewReportSchema })
  @RequireWorkspacePermission("interview", "read")
  report(@Req() request: Request, @Param({ schema: interviewChildPathSchema }) path: ChildPath) {
    return this.workflows.reports(
      getWorkspaceContext(request).workspace.id,
      path.id,
      path.conversationId,
    );
  }

  @Get("recordings/:conversationId")
  @ApiOperation({ operationId: "getWorkspaceInterviewRecording" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: recordingLinkSchema })
  @RequireWorkspacePermission("interview", "read")
  recording(@Req() request: Request, @Param({ schema: interviewChildPathSchema }) path: ChildPath) {
    return this.workflows.recording(
      getWorkspaceContext(request).workspace.id,
      path.id,
      path.conversationId,
    );
  }

  @Get("form-submissions")
  @ApiOperation({ operationId: "listWorkspaceInterviewFormSubmissions" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: formSubmissionsResponseSchema })
  @RequireWorkspacePermission("interview", "read")
  submissions(@Req() request: Request, @Param({ schema: interviewIdPathSchema }) path: IdPath) {
    return this.workflows.formSubmissions(getWorkspaceContext(request).workspace.id, path.id);
  }

  @Delete("form-submissions/:submissionId")
  @HttpCode(200)
  @ApiOperation({ operationId: "deleteWorkspaceInterviewFormSubmission" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: formSubmissionDeleteResponseSchema })
  @RequireWorkspacePermission("interview", "update")
  deleteSubmission(
    @Req() request: Request,
    @Param({ schema: submissionPathSchema }) path: SubmissionPath,
  ) {
    const context = getWorkspaceContext(request);
    return this.workflows.deleteSubmission(
      context.workspace.id,
      context.actor.id,
      path.id,
      path.submissionId,
    );
  }

  @Patch()
  @ApiOperation({ operationId: "updateWorkspaceInterviewRound" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: interviewDetailResponseSchema })
  @RequireWorkspacePermission("interview", "update")
  async patch(
    @Req() request: Request,
    @Param({ schema: interviewIdPathSchema }) path: IdPath,
    @Body({ schema: interviewRoundPatchSchema }) body: z.infer<typeof interviewRoundPatchSchema>,
  ) {
    const { context, visible } = await this.requestContext(request);
    return this.workflows.patchRound(
      context.workspace.id,
      context.actor.id,
      path.id,
      visible,
      body,
    );
  }

  @Get("question-template-bindings")
  @ApiOperation({ operationId: "listWorkspaceInterviewQuestionTemplateBindings" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: questionTemplateBindingsSchema })
  @RequireWorkspacePermission("interview", "read")
  bindings(@Req() request: Request, @Param({ schema: interviewIdPathSchema }) path: IdPath) {
    return this.workflows.bindings(getWorkspaceContext(request).workspace.id, path.id);
  }

  @Put("question-template-bindings")
  @ApiOperation({ operationId: "replaceWorkspaceInterviewQuestionTemplateBindings" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: questionTemplateBindingsSchema })
  @RequireWorkspacePermission("interview", "update")
  replaceBindings(
    @Req() request: Request,
    @Param({ schema: interviewIdPathSchema }) path: IdPath,
    @Body({ schema: bindingsInputSchema }) body: z.infer<typeof bindingsInputSchema>,
  ) {
    return this.workflows.replaceBindings(
      getWorkspaceContext(request).workspace.id,
      path.id,
      body.enabledTemplateIds,
    );
  }

  @Post("context-snapshot/refresh")
  @HttpCode(200)
  @ApiOperation({ operationId: "refreshWorkspaceInterviewContextSnapshot" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: contextSnapshotResponseSchema })
  @RequireWorkspacePermission("interview", "update")
  async refresh(@Req() request: Request, @Param({ schema: interviewIdPathSchema }) path: IdPath) {
    const { context } = await this.requestContext(request);
    const snapshot = await this.workflows.refreshSnapshot(
      context.workspace.id,
      context.actor.id,
      path.id,
      "manual_refresh",
    );
    return { snapshot };
  }

  @Post("reset")
  @HttpCode(200)
  @ApiOperation({ operationId: "resetWorkspaceInterviewRound" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: interviewDetailResponseSchema })
  @RequireWorkspacePermission("interview", "update")
  async reset(@Req() request: Request, @Param({ schema: interviewIdPathSchema }) path: IdPath) {
    const { context, visible } = await this.requestContext(request);
    return this.workflows.resetRound(context.workspace.id, context.actor.id, path.id, visible);
  }

  @Post("transition")
  @HttpCode(200)
  @ApiOperation({ operationId: "transitionWorkspaceInterviewCandidate" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: z.object({ ok: z.literal(true) }) })
  @RequireWorkspacePermission("interview", "update")
  async transition(
    @Req() request: Request,
    @Param({ schema: interviewIdPathSchema }) path: IdPath,
    @Body({ schema: transitionInputSchema }) body: z.infer<typeof transitionInputSchema>,
  ) {
    const context = getWorkspaceContext(request);
    let targetPermission: { action: "create"; resource: "humanInterview" | "offer" } | null = null;
    if (body.pipelineStage === "human_interview") {
      targetPermission = { action: "create", resource: "humanInterview" };
    } else if (body.pipelineStage === "offer") {
      targetPermission = { action: "create", resource: "offer" };
    }
    if (targetPermission && !(await this.access.authorize(context, targetPermission))) {
      throw new ForbiddenException();
    }
    return this.workflows.transition(context.workspace.id, context.actor.id, path.id, body);
  }

  @Patch("candidate-expectations")
  @ApiOperation({ operationId: "updateWorkspaceInterviewCandidateExpectations" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: candidateExpectationsResponseSchema })
  @RequireWorkspacePermission("interview", "update")
  expectations(
    @Req() request: Request,
    @Param({ schema: interviewIdPathSchema }) path: IdPath,
    @Body({ schema: candidateExpectationsPatchSchema })
    body: z.infer<typeof candidateExpectationsPatchSchema>,
  ) {
    return this.workflows.updateExpectations(
      getWorkspaceContext(request).workspace.id,
      path.id,
      body,
    );
  }

  @Get("human-interview-rounds")
  @ApiOperation({ operationId: "listWorkspaceHumanInterviewRounds" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: z.array(humanRoundRecordSchema) })
  @RequireWorkspacePermission("humanInterview", "read")
  humanRounds(@Req() request: Request, @Param({ schema: interviewIdPathSchema }) path: IdPath) {
    return this.workflows.humanRounds(getWorkspaceContext(request).workspace.id, path.id);
  }

  @Post("human-interview-rounds")
  @HttpCode(200)
  @ApiOperation({ operationId: "createWorkspaceHumanInterviewRound" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: humanRoundRecordSchema })
  @RequireWorkspacePermission("humanInterview", "create")
  createHumanRound(
    @Req() request: Request,
    @Param({ schema: interviewIdPathSchema }) path: IdPath,
    @Body({ schema: humanInterviewRoundInputSchema }) body: z.infer<
      typeof humanInterviewRoundInputSchema
    >,
  ) {
    const context = getWorkspaceContext(request);
    return this.workflows.createHumanRound(context.workspace.id, context.actor.id, path.id, body);
  }

  @Patch("human-interview-rounds/:roundId")
  @ApiOperation({ operationId: "updateWorkspaceHumanInterviewRound" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: humanRoundRecordSchema })
  @RequireWorkspacePermission("humanInterview", "update")
  updateHumanRound(
    @Req() request: Request,
    @Param({ schema: humanRoundPathSchema }) path: HumanRoundPath,
    @Body({ schema: humanInterviewRoundInputSchema.partial() })
    body: Partial<z.infer<typeof humanInterviewRoundInputSchema>>,
  ) {
    const context = getWorkspaceContext(request);
    return this.workflows.updateHumanRound(
      context.workspace.id,
      context.actor.id,
      path.id,
      path.roundId,
      body,
    );
  }

  @Post("human-interview-rounds/:roundId/complete")
  @HttpCode(200)
  @ApiOperation({ operationId: "completeWorkspaceHumanInterviewRound" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: humanRoundRecordSchema })
  @RequireWorkspacePermission("humanInterview", "update")
  completeHumanRound(
    @Req() request: Request,
    @Param({ schema: humanRoundPathSchema }) path: HumanRoundPath,
    @Body({ schema: completeHumanRoundSchema }) body: z.infer<typeof completeHumanRoundSchema>,
  ) {
    const context = getWorkspaceContext(request);
    return this.workflows.completeHumanRound(
      context.workspace.id,
      context.actor.id,
      path.id,
      path.roundId,
      body,
    );
  }

  @Post("human-interview-rounds/:roundId/cancel")
  @HttpCode(200)
  @ApiOperation({ operationId: "cancelWorkspaceHumanInterviewRound" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: humanRoundRecordSchema })
  @RequireWorkspacePermission("humanInterview", "delete")
  cancelHumanRound(
    @Req() request: Request,
    @Param({ schema: humanRoundPathSchema }) path: HumanRoundPath,
    @Body({ schema: cancelHumanRoundSchema }) body: z.infer<typeof cancelHumanRoundSchema>,
  ) {
    const context = getWorkspaceContext(request);
    return this.workflows.cancelHumanRound(
      context.workspace.id,
      context.actor.id,
      path.id,
      path.roundId,
      body.reason,
    );
  }

  @Get("offer-drafts")
  @ApiOperation({ operationId: "listWorkspaceInterviewOfferDrafts" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: z.array(offerRecordSchema) })
  @RequireWorkspacePermission("offer", "read")
  offers(@Req() request: Request, @Param({ schema: interviewIdPathSchema }) path: IdPath) {
    return this.workflows.offers(getWorkspaceContext(request).workspace.id, path.id);
  }

  @Post("offer-drafts")
  @HttpCode(200)
  @ApiOperation({ operationId: "createWorkspaceInterviewOfferDraft" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: offerRecordSchema })
  @RequireWorkspacePermission("offer", "create")
  createOffer(
    @Req() request: Request,
    @Param({ schema: interviewIdPathSchema }) path: IdPath,
    @Body({ schema: createOfferDraftSchema }) body: z.infer<typeof createOfferDraftSchema>,
  ) {
    const context = getWorkspaceContext(request);
    return this.workflows.createOffer(context.workspace.id, context.actor.id, path.id, body);
  }

  @Patch("offer-drafts/:draftId")
  @ApiOperation({ operationId: "updateWorkspaceInterviewOfferDraft" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: offerRecordSchema })
  @RequireWorkspacePermission("offer", "update")
  updateOffer(
    @Req() request: Request,
    @Param({ schema: offerDraftPathSchema }) path: OfferPath,
    @Body({ schema: offerDraftInputSchema.partial() }) body: Partial<
      z.infer<typeof offerDraftInputSchema>
    >,
  ) {
    const context = getWorkspaceContext(request);
    return this.workflows.updateOffer(
      context.workspace.id,
      context.actor.id,
      path.id,
      path.draftId,
      body,
    );
  }

  @Post("offer-drafts/:draftId/send")
  @HttpCode(200)
  @ApiOperation({ operationId: "sendWorkspaceInterviewOfferDraft" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: offerRecordSchema })
  @RequireWorkspacePermission("offer", "update")
  sendOffer(@Req() request: Request, @Param({ schema: offerDraftPathSchema }) path: OfferPath) {
    const context = getWorkspaceContext(request);
    return this.workflows.sendOffer(context.workspace.id, context.actor.id, path.id, path.draftId);
  }

  @Post("offer-drafts/:draftId/respond")
  @HttpCode(200)
  @ApiOperation({ operationId: "respondWorkspaceInterviewOfferDraft" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: offerRecordSchema })
  @RequireWorkspacePermission("offer", "update")
  respondOffer(
    @Req() request: Request,
    @Param({ schema: offerDraftPathSchema }) path: OfferPath,
    @Body({ schema: offerResponseInputSchema }) body: z.infer<typeof offerResponseInputSchema>,
  ) {
    const context = getWorkspaceContext(request);
    return this.workflows.respondOffer(
      context.workspace.id,
      context.actor.id,
      path.id,
      path.draftId,
      body,
    );
  }

  @Post("offer-drafts/:draftId/cancel")
  @HttpCode(200)
  @ApiOperation({ operationId: "cancelWorkspaceInterviewOfferDraft" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: offerRecordSchema })
  @RequireWorkspacePermission("offer", "delete")
  cancelOffer(@Req() request: Request, @Param({ schema: offerDraftPathSchema }) path: OfferPath) {
    const context = getWorkspaceContext(request);
    return this.workflows.cancelOffer(
      context.workspace.id,
      context.actor.id,
      path.id,
      path.draftId,
    );
  }
}

@ApiTags("workspace-interviews")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/studio/interviews/:interviewRecordId/notification-recipients")
export class InterviewNotificationRecipientsController extends InterviewControllerBase {
  @Get()
  @ApiOperation({ operationId: "listWorkspaceInterviewNotificationRecipients" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: recipientsResponseSchema })
  @RequireWorkspacePermission("interview", "read")
  list(@Req() request: Request, @Param({ schema: recordPathSchema }) path: RecordPath) {
    return this.workflows.notificationRecipients(
      getWorkspaceContext(request).workspace.id,
      path.interviewRecordId,
    );
  }

  @Put()
  @ApiOperation({ operationId: "replaceWorkspaceInterviewNotificationRecipients" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: recipientsResponseSchema })
  @RequireWorkspacePermission("interview", "update")
  replace(
    @Req() request: Request,
    @Param({ schema: recordPathSchema }) path: RecordPath,
    @Body({ schema: recipientInputSchema }) body: z.infer<typeof recipientInputSchema>,
  ) {
    const context = getWorkspaceContext(request);
    return this.workflows.replaceNotificationRecipients(
      context.workspace.id,
      context.actor.id,
      path.interviewRecordId,
      body,
    );
  }
}

@ApiTags("workspace-interviews")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/studio/interviews/human-interview-meetings")
export class HumanInterviewMeetingController extends InterviewControllerBase {
  @Get()
  @ApiOperation({ operationId: "listWorkspaceHumanInterviewMeetings" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: humanMeetingsResponseSchema })
  @RequireWorkspacePermission("humanInterview", "read")
  list(
    @Req() request: Request,
    @Query({ schema: meetingListQuerySchema }) query: z.infer<typeof meetingListQuerySchema>,
  ) {
    return this.workflows.meetings(getWorkspaceContext(request).workspace.id, query);
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({ operationId: "createWorkspaceHumanInterviewMeeting" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: humanMeetingResponseSchema })
  @RequireWorkspacePermission("humanInterview", "create")
  create(
    @Req() request: Request,
    @Body({ schema: humanInterviewMeetingInputSchema }) body: z.infer<
      typeof humanInterviewMeetingInputSchema
    >,
  ) {
    const context = getWorkspaceContext(request);
    return this.workflows.createMeeting(context.workspace.id, context.actor.id, body);
  }

  @Get(":meetingId")
  @ApiOperation({ operationId: "getWorkspaceHumanInterviewMeeting" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: humanMeetingResponseSchema })
  @RequireWorkspacePermission("humanInterview", "read")
  get(@Req() request: Request, @Param({ schema: meetingPathSchema }) path: MeetingPath) {
    return this.workflows.getMeeting(getWorkspaceContext(request).workspace.id, path.meetingId);
  }

  @Patch(":meetingId")
  @ApiOperation({ operationId: "updateWorkspaceHumanInterviewMeeting" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: humanMeetingResponseSchema })
  @RequireWorkspacePermission("humanInterview", "update")
  update(
    @Req() request: Request,
    @Param({ schema: meetingPathSchema }) path: MeetingPath,
    @Body({ schema: humanInterviewMeetingScheduleUpdateSchema })
    body: z.infer<typeof humanInterviewMeetingScheduleUpdateSchema>,
  ) {
    const context = getWorkspaceContext(request);
    return this.workflows.updateMeeting(
      context.workspace.id,
      context.actor.id,
      path.meetingId,
      body,
    );
  }

  @Post(":meetingId/feishu-sync")
  @HttpCode(200)
  @ApiOperation({ operationId: "syncWorkspaceHumanInterviewMeetingToFeishu" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: humanMeetingResponseSchema })
  @RequireWorkspacePermission("humanInterview", "update")
  sync(@Req() request: Request, @Param({ schema: meetingPathSchema }) path: MeetingPath) {
    return this.workflows.syncMeetingToFeishu(
      getWorkspaceContext(request).workspace.id,
      path.meetingId,
    );
  }

  @Post(":meetingId/links")
  @HttpCode(200)
  @ApiOperation({ operationId: "issueWorkspaceHumanInterviewMeetingLinks" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: humanMeetingLinksResponseSchema })
  @RequireWorkspacePermission("humanInterview", "update")
  links(@Req() request: Request, @Param({ schema: meetingPathSchema }) path: MeetingPath) {
    return this.workflows.issueMeetingLinks(
      getWorkspaceContext(request).workspace.id,
      path.meetingId,
    );
  }

  @Post(":meetingId/livekit-token")
  @HttpCode(200)
  @ApiOperation({ operationId: "createWorkspaceHumanInterviewMeetingLiveKitToken" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingTokenResponseSchema })
  @RequireWorkspacePermission("humanInterview", "read")
  token(
    @Req() request: Request,
    @Param({ schema: meetingPathSchema }) path: MeetingPath,
    @Body({ schema: humanMeetingTokenInputSchema }) body: z.infer<
      typeof humanMeetingTokenInputSchema
    >,
  ) {
    const context = getWorkspaceContext(request);
    return this.workflows.meetingLiveKitToken(
      context.workspace.id,
      context.actor.id,
      path.meetingId,
      body.interviewerId,
    );
  }

  @Post(":meetingId/end")
  @HttpCode(200)
  @ApiOperation({ operationId: "endWorkspaceHumanInterviewMeeting" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: humanMeetingResponseSchema })
  @RequireWorkspacePermission("humanInterview", "update")
  end(@Req() request: Request, @Param({ schema: meetingPathSchema }) path: MeetingPath) {
    return this.workflows.endMeeting(getWorkspaceContext(request).workspace.id, path.meetingId);
  }

  @Delete(":meetingId")
  @HttpCode(200)
  @ApiOperation({ operationId: "cancelWorkspaceHumanInterviewMeeting" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: humanMeetingResponseSchema })
  @RequireWorkspacePermission("humanInterview", "delete")
  cancel(@Req() request: Request, @Param({ schema: meetingPathSchema }) path: MeetingPath) {
    return this.workflows.cancelMeeting(getWorkspaceContext(request).workspace.id, path.meetingId);
  }
}

@ApiTags("workspace-interviews")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/studio/interviews/round-emails")
export class InterviewRoundEmailController extends InterviewControllerBase {
  @Post(":roundId/send")
  @HttpCode(200)
  @ApiOperation({ operationId: "sendWorkspaceInterviewRoundEmail" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: roundEmailSendResponseSchema })
  @RequireWorkspacePermission("interview", "update")
  send(@Req() request: Request, @Param({ schema: roundEmailPathSchema }) path: RoundEmailPath) {
    const context = getWorkspaceContext(request);
    return this.workflows.sendRoundEmail(context.workspace.id, context.actor.id, path.roundId);
  }

  @Get("summary")
  @ApiOperation({ operationId: "getWorkspaceInterviewRoundEmailSummary" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: roundEmailSummaryResponseSchema })
  @RequireWorkspacePermission("interview", "read")
  summary(
    @Req() request: Request,
    @Query({ schema: roundEmailSummaryQuerySchema }) query: z.infer<
      typeof roundEmailSummaryQuerySchema
    >,
  ) {
    return this.workflows.roundEmailSummary(
      getWorkspaceContext(request).workspace.id,
      query.roundIds,
    );
  }
}
