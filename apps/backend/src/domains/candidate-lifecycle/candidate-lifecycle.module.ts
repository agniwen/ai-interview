/* oxlint-disable typescript/no-extraneous-class -- Nest modules are declarative classes. */
import { Module } from "@nestjs/common";
import { BackgroundQueueModule } from "../../background/background-queue.module.js";
import { HttpInfrastructureModule } from "../../infrastructure/http/http-infrastructure.module.js";
import { WorkspaceAccessHttpModule } from "../../infrastructure/http/workspace-access/index.js";
import { RecruitingScopeModule } from "../identity-access/recruiting-scope/recruiting-scope.module.js";
import { DatabaseModule } from "../../infrastructure/database/database.module.js";
import { WorkspaceInfrastructureModule } from "../../infrastructure/workspace/workspace-infrastructure.module.js";
import { VectorSearchInfrastructureModule } from "../../infrastructure/vector-search/vector-search-infrastructure.module.js";
import { AgentJobsService } from "./ai-interviews/agent/agent-jobs.service.js";
import { AgentController } from "./ai-interviews/agent/agent.controller.js";
import { AGENT_JOBS_PORT, AGENT_PORT } from "./ai-interviews/agent/agent.port.js";
import { AgentService } from "./ai-interviews/agent/agent.service.js";
import { CalendarController } from "./ai-interviews/calendar/calendar.controller.js";
import { CalendarService } from "./ai-interviews/calendar/calendar.service.js";
import { CANDIDATE_COPILOT_COMMANDS } from "./copilot-actions/candidate-copilot.commands.js";
import { CandidateCopilotService } from "./copilot-actions/candidate-copilot.service.js";
import { InterviewController } from "./ai-interviews/candidate-api/interview.controller.js";
import { CANDIDATE_INTERVIEW_PORT } from "./ai-interviews/candidate-api/interview.port.js";
import { InterviewService } from "./ai-interviews/candidate-api/interview.service.js";
import {
  PublicController,
  PublicHumanInterviewCandidateMaterialsController,
} from "./candidate-api/public/public.controller.js";
import { PUBLIC_RECRUITING_PORT } from "./candidate-api/public/public.port.js";
import { PublicService } from "./candidate-api/public/public.service.js";
import { ResumeController } from "./candidate-api/resume/resume.controller.js";
import { RESUME_UTILITY_PORT } from "./candidate-api/resume/resume.port.js";
import { ResumeService } from "./candidate-api/resume/resume.service.js";
import { CANDIDATE_DOCUMENT_COMMANDS } from "./documents/candidate-document.commands.js";
import { CandidateDocumentService } from "./documents/candidate-document.service.js";
import { CANDIDATE_DOCUMENT_ADMIN_COMMANDS } from "./documents/candidate-document-admin.commands.js";
import { CandidateDocumentAdminService } from "./documents/candidate-document-admin.service.js";
import { LiveKitHumanMeetingService } from "./human-interviews/livekit/livekit-human-meeting.service.js";
import { LiveKitController } from "./human-interviews/livekit/livekit.controller.js";
import {
  HUMAN_MEETING_LIVEKIT_PORT,
  LIVEKIT_WEBHOOK_PORT,
} from "./human-interviews/livekit/livekit.port.js";
import { LiveKitService } from "./human-interviews/livekit/livekit.service.js";
import { CandidateRecoveryModule } from "./workloads/recovery/candidate-recovery.module.js";
import { MailIngestController } from "./intake/mail-ingest/mail-ingest.controller.js";
import { MailIngestService } from "./intake/mail-ingest/mail-ingest.service.js";
import { MAIL_INGEST_ADMIN_COMMANDS } from "./intake/mail-ingest/mail-ingest-admin.commands.js";
import { MailIngestAdminService } from "./intake/mail-ingest/mail-ingest-admin.service.js";
import { ResumePoolController } from "./intake/resume-pool/resume-pool.controller.js";
import { ResumePoolService } from "./intake/resume-pool/resume-pool.service.js";
import { ResumeUploadBatchController } from "./intake/upload-batches/resume-upload-batch.controller.js";
import { ResumeUploadBatchService } from "./intake/upload-batches/resume-upload-batch.service.js";
import { InterviewCoreController } from "./recruiting-records/interviews/interview-core.controller.js";
import { InterviewCoreService } from "./recruiting-records/interviews/interview-core.service.js";
import {
  HumanInterviewMeetingController,
  InterviewCollectionController,
  InterviewDetailController,
  InterviewNotificationRecipientsController,
  InterviewRoundEmailController,
} from "./recruiting-records/interviews/interview-workflow.controller.js";
import { InterviewWorkflowService } from "./recruiting-records/interviews/interview-workflow.service.js";
import { ResumeCoreController } from "./resume-library/resumes/resume-core.controller.js";
import { ResumeCoreService } from "./resume-library/resumes/resume-core.service.js";
import { ResumeWorkflowController } from "./resume-library/resumes/resume-workflow.controller.js";
import { ResumeWorkflowService } from "./resume-library/resumes/resume-workflow.service.js";
import { CANDIDATE_NOTIFICATION_ADMIN_COMMANDS } from "./notifications/candidate-notification-admin.commands.js";
import { CandidateNotificationAdminService } from "./notifications/candidate-notification-admin.service.js";
import { CANDIDATE_SEMANTIC_INDEX_COMMANDS } from "./semantic-index/candidate-semantic-index.commands.js";
import { CandidateSemanticIndexService } from "./semantic-index/candidate-semantic-index.service.js";
import { CANDIDATE_SETUP_REFRESH_COMMANDS } from "./setup-refresh/candidate-setup-refresh.commands.js";
import { CandidateSetupRefreshService } from "./setup-refresh/candidate-setup-refresh.service.js";
import { CANDIDATE_EVALUATION_COMMANDS } from "./evaluations/candidate-evaluation.commands.js";
import { CandidateEvaluationService } from "./evaluations/candidate-evaluation.service.js";

@Module({
  controllers: [
    AgentController,
    CalendarController,
    InterviewController,
    PublicController,
    PublicHumanInterviewCandidateMaterialsController,
    ResumeController,
    LiveKitController,
    MailIngestController,
    ResumePoolController,
    ResumeUploadBatchController,
    InterviewCoreController,
    InterviewCollectionController,
    InterviewDetailController,
    InterviewNotificationRecipientsController,
    HumanInterviewMeetingController,
    InterviewRoundEmailController,
    ResumeCoreController,
    ResumeWorkflowController,
  ],
  exports: [
    CANDIDATE_COPILOT_COMMANDS,
    CANDIDATE_DOCUMENT_ADMIN_COMMANDS,
    CANDIDATE_DOCUMENT_COMMANDS,
    CANDIDATE_EVALUATION_COMMANDS,
    CANDIDATE_SEMANTIC_INDEX_COMMANDS,
    CANDIDATE_SETUP_REFRESH_COMMANDS,
    CANDIDATE_NOTIFICATION_ADMIN_COMMANDS,
    MAIL_INGEST_ADMIN_COMMANDS,
  ],
  imports: [
    BackgroundQueueModule,
    DatabaseModule,
    HttpInfrastructureModule,
    CandidateRecoveryModule,
    RecruitingScopeModule,
    WorkspaceAccessHttpModule,
    WorkspaceInfrastructureModule,
    VectorSearchInfrastructureModule,
  ],
  providers: [
    { provide: CANDIDATE_COPILOT_COMMANDS, useClass: CandidateCopilotService },
    {
      provide: CANDIDATE_DOCUMENT_ADMIN_COMMANDS,
      useClass: CandidateDocumentAdminService,
    },
    { provide: CANDIDATE_DOCUMENT_COMMANDS, useClass: CandidateDocumentService },
    {
      provide: CANDIDATE_EVALUATION_COMMANDS,
      useClass: CandidateEvaluationService,
    },
    { provide: AGENT_JOBS_PORT, useClass: AgentJobsService },
    { provide: AGENT_PORT, useClass: AgentService },
    CalendarService,
    { provide: CANDIDATE_INTERVIEW_PORT, useClass: InterviewService },
    { provide: PUBLIC_RECRUITING_PORT, useClass: PublicService },
    { provide: RESUME_UTILITY_PORT, useClass: ResumeService },
    {
      provide: HUMAN_MEETING_LIVEKIT_PORT,
      useClass: LiveKitHumanMeetingService,
    },
    { provide: LIVEKIT_WEBHOOK_PORT, useClass: LiveKitService },
    MailIngestService,
    { provide: MAIL_INGEST_ADMIN_COMMANDS, useClass: MailIngestAdminService },
    ResumePoolService,
    ResumeUploadBatchService,
    InterviewCoreService,
    InterviewWorkflowService,
    {
      provide: CANDIDATE_NOTIFICATION_ADMIN_COMMANDS,
      useClass: CandidateNotificationAdminService,
    },
    ResumeCoreService,
    ResumeWorkflowService,
    {
      provide: CANDIDATE_SEMANTIC_INDEX_COMMANDS,
      useClass: CandidateSemanticIndexService,
    },
    {
      provide: CANDIDATE_SETUP_REFRESH_COMMANDS,
      useClass: CandidateSetupRefreshService,
    },
  ],
})
export class CandidateLifecycleModule {}
