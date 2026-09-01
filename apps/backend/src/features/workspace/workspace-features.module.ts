import { Module } from "@nestjs/common";
import { BackgroundQueueModule } from "../../background/background-queue.module.js";
import { DepartmentController } from "./departments/department.controller.js";
import { DepartmentService } from "./departments/department.service.js";
import { WorkspaceAccessGuard } from "./workspace-access.js";
import { GlobalConfigController } from "./global-config/global-config.controller.js";
import { GlobalConfigService } from "./global-config/global-config.service.js";
import { WorkspaceSettingsController } from "./settings/workspace-settings.controller.js";
import { WorkspaceSettingsService } from "./settings/workspace-settings.service.js";
import { WorkspaceMembersController } from "./members/workspace-members.controller.js";
import { WorkspaceMembersService } from "./members/workspace-members.service.js";
import { ResumeCoreController } from "./resumes/resume-core.controller.js";
import { ResumeCoreService } from "./resumes/resume-core.service.js";
import { ResumeWorkflowController } from "./resumes/resume-workflow.controller.js";
import { ResumeWorkflowService } from "./resumes/resume-workflow.service.js";
import { InterviewCoreController } from "./interviews/interview-core.controller.js";
import { InterviewCoreService } from "./interviews/interview-core.service.js";
import {
  HumanInterviewMeetingController,
  InterviewCollectionController,
  InterviewDetailController,
  InterviewNotificationRecipientsController,
  InterviewRoundEmailController,
} from "./interviews/interview-workflow.controller.js";
import { InterviewWorkflowService } from "./interviews/interview-workflow.service.js";
import { WorkspaceInfrastructureModule } from "../../infrastructure/workspace/workspace-infrastructure.module.js";
import { InterviewerController } from "./interviewers/interviewer.controller.js";
import { InterviewerService } from "./interviewers/interviewer.service.js";
import { CandidateFormController } from "./forms/candidate-form.controller.js";
import { CandidateFormService } from "./forms/candidate-form.service.js";
import { InviteLinkController } from "./invite-links/invite-link.controller.js";
import { InviteLinkService } from "./invite-links/invite-link.service.js";
import { QuestionTemplateController } from "./question-templates/question-template.controller.js";
import { QuestionTemplateService } from "./question-templates/question-template.service.js";
import { CalendarController } from "./calendar/calendar.controller.js";
import { CalendarService } from "./calendar/calendar.service.js";
import { MailIngestController } from "./mail-ingest/mail-ingest.controller.js";
import { MailIngestService } from "./mail-ingest/mail-ingest.service.js";
import { JobDescriptionController } from "./job-descriptions/job-description.controller.js";
import { JobDescriptionService } from "./job-descriptions/job-description.service.js";
import { JobEvaluationLifecycleController } from "./job-descriptions/job-evaluation-lifecycle.controller.js";
import { JobEvaluationLifecycleService } from "./job-descriptions/job-evaluation-lifecycle.service.js";
import { ResumeUploadBatchController } from "./resume-upload-batches/resume-upload-batch.controller.js";
import { ResumeUploadBatchService } from "./resume-upload-batches/resume-upload-batch.service.js";
import { MeetingCoreController } from "./meetings/meeting-core.controller.js";
import { MeetingCoreService } from "./meetings/meeting-core.service.js";
import { MeetingCollaborationController } from "./meetings/meeting-collaboration.controller.js";
import { MeetingCollaborationService } from "./meetings/meeting-collaboration.service.js";
import { ResumePoolController } from "./resume-pool/resume-pool.controller.js";
import { ResumePoolService } from "./resume-pool/resume-pool.service.js";
import { MeetingProcessingController } from "./meetings/meeting-processing.controller.js";
import { MeetingProcessingService } from "./meetings/meeting-processing.service.js";
import { MeetingIntelligenceController } from "./meetings/meeting-intelligence.controller.js";
import { MeetingIntelligenceService } from "./meetings/meeting-intelligence.service.js";
import { MeetingRecruitingController } from "./meetings/meeting-recruiting.controller.js";
import { MeetingRecruitingService } from "./meetings/meeting-recruiting.service.js";
import { MeetingLifecycleController } from "./meetings/meeting-lifecycle.controller.js";
import { MeetingLifecycleService } from "./meetings/meeting-lifecycle.service.js";
import { MeetingSearchController } from "./meetings/meeting-search.controller.js";
import { MeetingSearchService } from "./meetings/meeting-search.service.js";
import { MeetingTitleController } from "./meetings/meeting-title.controller.js";
import { MeetingTitleService } from "./meetings/meeting-title.service.js";
import { MeetingUploadController } from "./meetings/meeting-upload.controller.js";
import { MeetingUploadService } from "./meetings/meeting-upload.service.js";
import { MeetingExportController } from "./meetings/meeting-export.controller.js";
import { MeetingExportService } from "./meetings/meeting-export.service.js";
import { MeetingQuestionController } from "./meetings/meeting-question.controller.js";
import { MeetingQuestionService } from "./meetings/meeting-question.service.js";
import { MeetingLiveTranscriptController } from "./meetings/meeting-live-transcript.controller.js";
import { MeetingLiveTranscriptService } from "./meetings/meeting-live-transcript.service.js";
import { ChatController } from "./chat/chat.controller.js";
import { ChatService } from "./chat/chat.service.js";
import { ChatStorage } from "./chat/chat-storage.js";
import { InterviewToolsController } from "./interview-tools/interview-tools.controller.js";
import { InterviewToolsService } from "./interview-tools/interview-tools.service.js";
import { ResumeChatController } from "./interview-tools/resume-chat.controller.js";
import { ResumeChatService } from "./interview-tools/resume-chat.service.js";
import { RecruitingMastraLifecycleService } from "./interview-tools/recruiting-mastra-lifecycle.service.js";

@Module({
  controllers: [
    ChatController,
    DepartmentController,
    CalendarController,
    CandidateFormController,
    GlobalConfigController,
    InterviewCoreController,
    InterviewCollectionController,
    HumanInterviewMeetingController,
    InterviewRoundEmailController,
    InterviewNotificationRecipientsController,
    InterviewDetailController,
    InterviewToolsController,
    InterviewerController,
    InviteLinkController,
    JobDescriptionController,
    JobEvaluationLifecycleController,
    MailIngestController,
    MeetingCollaborationController,
    MeetingCoreController,
    MeetingExportController,
    MeetingIntelligenceController,
    MeetingLifecycleController,
    MeetingLiveTranscriptController,
    MeetingProcessingController,
    MeetingQuestionController,
    MeetingRecruitingController,
    MeetingSearchController,
    MeetingTitleController,
    MeetingUploadController,
    QuestionTemplateController,
    ResumePoolController,
    ResumeUploadBatchController,
    ResumeCoreController,
    ResumeChatController,
    ResumeWorkflowController,
    WorkspaceMembersController,
    WorkspaceSettingsController,
  ],
  exports: [
    ChatService,
    DepartmentService,
    CalendarService,
    CandidateFormService,
    GlobalConfigService,
    InterviewCoreService,
    InterviewWorkflowService,
    InterviewToolsService,
    InterviewerService,
    InviteLinkService,
    JobDescriptionService,
    JobEvaluationLifecycleService,
    MailIngestService,
    MeetingCollaborationService,
    MeetingCoreService,
    MeetingExportService,
    MeetingIntelligenceService,
    MeetingLifecycleService,
    MeetingLiveTranscriptService,
    MeetingProcessingService,
    MeetingQuestionService,
    MeetingRecruitingService,
    MeetingSearchService,
    MeetingTitleService,
    MeetingUploadService,
    QuestionTemplateService,
    ResumePoolService,
    ResumeUploadBatchService,
    ResumeCoreService,
    ResumeChatService,
    ResumeWorkflowService,
    WorkspaceAccessGuard,
    WorkspaceMembersService,
    WorkspaceSettingsService,
  ],
  imports: [BackgroundQueueModule.register(), WorkspaceInfrastructureModule],
  providers: [
    ChatService,
    ChatStorage,
    DepartmentService,
    CalendarService,
    CandidateFormService,
    GlobalConfigService,
    InterviewCoreService,
    InterviewWorkflowService,
    InterviewToolsService,
    InterviewerService,
    InviteLinkService,
    JobDescriptionService,
    JobEvaluationLifecycleService,
    MailIngestService,
    MeetingCollaborationService,
    MeetingCoreService,
    MeetingExportService,
    MeetingIntelligenceService,
    MeetingLifecycleService,
    MeetingLiveTranscriptService,
    MeetingProcessingService,
    MeetingQuestionService,
    MeetingRecruitingService,
    MeetingSearchService,
    MeetingTitleService,
    MeetingUploadService,
    QuestionTemplateService,
    ResumePoolService,
    ResumeUploadBatchService,
    ResumeCoreService,
    ResumeChatService,
    RecruitingMastraLifecycleService,
    ResumeWorkflowService,
    WorkspaceAccessGuard,
    WorkspaceMembersService,
    WorkspaceSettingsService,
  ],
})
export class WorkspaceFeaturesModule {}
