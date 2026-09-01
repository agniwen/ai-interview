/* oxlint-disable typescript/no-extraneous-class -- Nest modules are declarative classes. */
import { Module } from "@nestjs/common";
import { BackgroundQueueModule } from "../../../background/background-queue.module.js";
import { WorkspaceAccessHttpModule } from "../../../infrastructure/http/workspace-access/index.js";
import { RecruitingScopeModule } from "../../identity-access/recruiting-scope/recruiting-scope.module.js";
import { WorkspaceInfrastructureModule } from "../../../infrastructure/workspace/workspace-infrastructure.module.js";
import { MeetingCollaborationController } from "./meeting-collaboration.controller.js";
import { MeetingCollaborationService } from "./meeting-collaboration.service.js";
import { MeetingCoreController } from "./meeting-core.controller.js";
import { MeetingCoreService } from "./meeting-core.service.js";
import { MeetingExportController } from "./meeting-export.controller.js";
import { MeetingExportService } from "./meeting-export.service.js";
import { MeetingIntelligenceController } from "./meeting-intelligence.controller.js";
import { MeetingIntelligenceService } from "./meeting-intelligence.service.js";
import { MeetingLifecycleController } from "./meeting-lifecycle.controller.js";
import { MeetingLifecycleService } from "./meeting-lifecycle.service.js";
import { MeetingLiveTranscriptController } from "./meeting-live-transcript.controller.js";
import { MeetingLiveTranscriptService } from "./meeting-live-transcript.service.js";
import { MeetingProcessingController } from "./meeting-processing.controller.js";
import { MeetingProcessingService } from "./meeting-processing.service.js";
import { MeetingQuestionController } from "./meeting-question.controller.js";
import { MeetingQuestionService } from "./meeting-question.service.js";
import { MeetingRecruitingController } from "./meeting-recruiting.controller.js";
import { MeetingRecruitingService } from "./meeting-recruiting.service.js";
import { MeetingSearchController } from "./meeting-search.controller.js";
import { MeetingSearchService } from "./meeting-search.service.js";
import { MeetingTitleController } from "./meeting-title.controller.js";
import { MeetingTitleService } from "./meeting-title.service.js";
import { MeetingUploadController } from "./meeting-upload.controller.js";
import { MeetingUploadService } from "./meeting-upload.service.js";

@Module({
  controllers: [
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
  ],
  imports: [
    BackgroundQueueModule,
    RecruitingScopeModule,
    WorkspaceAccessHttpModule,
    WorkspaceInfrastructureModule,
  ],
  providers: [
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
  ],
})
export class MeetingSessionsModule {}
