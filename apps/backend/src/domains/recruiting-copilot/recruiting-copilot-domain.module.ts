/* oxlint-disable typescript/no-extraneous-class -- Nest modules are declarative classes. */
import { Module } from "@nestjs/common";
import { CandidateLifecycleModule } from "../candidate-lifecycle/candidate-lifecycle.module.js";
import { WorkspaceAccessHttpModule } from "../../infrastructure/http/workspace-access/index.js";
import { RecruitingScopeModule } from "../identity-access/recruiting-scope/recruiting-scope.module.js";
import { WorkspaceInfrastructureModule } from "../../infrastructure/workspace/workspace-infrastructure.module.js";
import { ChatStorage } from "./chat/chat-storage.js";
import { ChatController } from "./chat/chat.controller.js";
import { ChatService } from "./chat/chat.service.js";
import { InterviewToolsController } from "./tools/interview-tools.controller.js";
import { InterviewToolsService } from "./tools/interview-tools.service.js";
import { RecruitingMastraLifecycleService } from "./tools/recruiting-mastra-lifecycle.service.js";
import { ResumeChatController } from "./tools/resume-chat.controller.js";
import { ResumeChatService } from "./tools/resume-chat.service.js";

@Module({
  controllers: [ChatController, InterviewToolsController, ResumeChatController],
  imports: [
    CandidateLifecycleModule,
    RecruitingScopeModule,
    WorkspaceAccessHttpModule,
    WorkspaceInfrastructureModule,
  ],
  providers: [
    ChatService,
    ChatStorage,
    InterviewToolsService,
    RecruitingMastraLifecycleService,
    ResumeChatService,
  ],
})
export class RecruitingCopilotDomainModule {}
