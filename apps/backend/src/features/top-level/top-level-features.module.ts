import { Module } from "@nestjs/common";
import { BackgroundQueueModule } from "../../background/background-queue.module.js";
import { API_DATABASE } from "../../infrastructure/database/database.tokens.js";
import { AgentController } from "./agent/agent.controller.js";
import { TOP_LEVEL_AGENT_PORT, TOP_LEVEL_AGENT_JOBS_PORT } from "./agent/agent.port.js";
import { AgentService } from "./agent/agent.service.js";
import { AgentJobsService } from "./agent/agent-jobs.service.js";
import { InterviewController } from "./interview/interview.controller.js";
import { TOP_LEVEL_INTERVIEW_PORT } from "./interview/interview.port.js";
import { InterviewService } from "./interview/interview.service.js";
import { JoinController } from "./join/join.controller.js";
import {
  TOP_LEVEL_JOIN_PORT,
  TOP_LEVEL_JOIN_EFFECTS_PORT,
  TOP_LEVEL_JOIN_NOTIFICATION_PORT,
} from "./join/join.port.js";
import { JoinEffectsService } from "./join/join-effects.service.js";
import { JoinNotificationService } from "./join/join-notification.service.js";
import { JoinService } from "./join/join.service.js";
import { LiveKitController } from "./livekit/livekit.controller.js";
import {
  TOP_LEVEL_LIVEKIT_PORT,
  TOP_LEVEL_LIVEKIT_HUMAN_MEETING_PORT,
} from "./livekit/livekit.port.js";
import { LiveKitService } from "./livekit/livekit.service.js";
import { LiveKitHumanMeetingService } from "./livekit/livekit-human-meeting.service.js";
import { MeetingLocalRecoveryController } from "./meeting-local-recovery/meeting-local-recovery.controller.js";
import { TOP_LEVEL_MEETING_LOCAL_RECOVERY_PORT } from "./meeting-local-recovery/meeting-local-recovery.port.js";
import { MeetingLocalRecoveryService } from "./meeting-local-recovery/meeting-local-recovery.service.js";
import { PlatformController } from "./platform/platform.controller.js";
import {
  TOP_LEVEL_PLATFORM_PORT,
  TOP_LEVEL_PLATFORM_OPERATIONS_PORT,
} from "./platform/platform.port.js";
import { PlatformService } from "./platform/platform.service.js";
import { PlatformOperationsService } from "./platform/platform-operations.service.js";
import {
  PublicController,
  PublicHumanInterviewCandidateMaterialsController,
} from "./public/public.controller.js";
import { TOP_LEVEL_PUBLIC_PORT } from "./public/public.port.js";
import { PublicService } from "./public/public.service.js";
import { ResumeController } from "./resume/resume.controller.js";
import { TOP_LEVEL_RESUME_PORT } from "./resume/resume.port.js";
import { ResumeService } from "./resume/resume.service.js";
import { TOP_LEVEL_DATABASE_PORT, TOP_LEVEL_AUTH_PORT } from "./top-level.ports.js";
import { TopLevelAuthService } from "./top-level-auth.service.js";

export const TOP_LEVEL_CONTROLLERS = [
  AgentController,
  InterviewController,
  JoinController,
  LiveKitController,
  MeetingLocalRecoveryController,
  PlatformController,
  PublicController,
  PublicHumanInterviewCandidateMaterialsController,
  ResumeController,
] as const;

@Module({
  controllers: [...TOP_LEVEL_CONTROLLERS],
  exports: [
    TOP_LEVEL_DATABASE_PORT,
    TOP_LEVEL_AGENT_PORT,
    TOP_LEVEL_AUTH_PORT,
    TOP_LEVEL_JOIN_PORT,
    TOP_LEVEL_INTERVIEW_PORT,
    TOP_LEVEL_JOIN_EFFECTS_PORT,
    TOP_LEVEL_MEETING_LOCAL_RECOVERY_PORT,
    TOP_LEVEL_LIVEKIT_PORT,
    TOP_LEVEL_PLATFORM_PORT,
    TOP_LEVEL_PUBLIC_PORT,
    TOP_LEVEL_RESUME_PORT,
  ],
  imports: [BackgroundQueueModule.register()],
  providers: [
    { provide: TOP_LEVEL_DATABASE_PORT, useExisting: API_DATABASE },
    { provide: TOP_LEVEL_AGENT_PORT, useClass: AgentService },
    { provide: TOP_LEVEL_AGENT_JOBS_PORT, useClass: AgentJobsService },
    { provide: TOP_LEVEL_AUTH_PORT, useClass: TopLevelAuthService },
    { provide: TOP_LEVEL_JOIN_PORT, useClass: JoinService },
    { provide: TOP_LEVEL_INTERVIEW_PORT, useClass: InterviewService },
    { provide: TOP_LEVEL_JOIN_EFFECTS_PORT, useClass: JoinEffectsService },
    { provide: TOP_LEVEL_JOIN_NOTIFICATION_PORT, useClass: JoinNotificationService },
    {
      provide: TOP_LEVEL_MEETING_LOCAL_RECOVERY_PORT,
      useClass: MeetingLocalRecoveryService,
    },
    { provide: TOP_LEVEL_RESUME_PORT, useClass: ResumeService },
    { provide: TOP_LEVEL_LIVEKIT_PORT, useClass: LiveKitService },
    {
      provide: TOP_LEVEL_LIVEKIT_HUMAN_MEETING_PORT,
      useClass: LiveKitHumanMeetingService,
    },
    { provide: TOP_LEVEL_PLATFORM_PORT, useClass: PlatformService },
    {
      provide: TOP_LEVEL_PLATFORM_OPERATIONS_PORT,
      useClass: PlatformOperationsService,
    },
    { provide: TOP_LEVEL_PUBLIC_PORT, useClass: PublicService },
  ],
})
export class TopLevelFeaturesModule {}
