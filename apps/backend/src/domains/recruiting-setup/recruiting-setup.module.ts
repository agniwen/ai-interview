import { Module } from "@nestjs/common";
import { BackgroundQueueModule } from "../../background/background-queue.module.js";
import { CandidateLifecycleModule } from "../candidate-lifecycle/candidate-lifecycle.module.js";
import { WorkspaceAccessHttpModule } from "../../infrastructure/http/workspace-access/index.js";
import { WorkspaceInfrastructureModule } from "../../infrastructure/workspace/workspace-infrastructure.module.js";
import { DepartmentController } from "./departments/department.controller.js";
import { DepartmentService } from "./departments/department.service.js";
import { CandidateFormController } from "./forms/candidate-form.controller.js";
import { CandidateFormService } from "./forms/candidate-form.service.js";
import { GlobalConfigController } from "./global-config/global-config.controller.js";
import { GlobalConfigService } from "./global-config/global-config.service.js";
import { InterviewerController } from "./interviewers/interviewer.controller.js";
import { InterviewerService } from "./interviewers/interviewer.service.js";
import { QuestionTemplateController } from "./question-templates/question-template.controller.js";
import { QuestionTemplateService } from "./question-templates/question-template.service.js";

@Module({
  controllers: [
    DepartmentController,
    GlobalConfigController,
    CandidateFormController,
    InterviewerController,
    QuestionTemplateController,
  ],
  imports: [
    BackgroundQueueModule,
    CandidateLifecycleModule,
    WorkspaceAccessHttpModule,
    WorkspaceInfrastructureModule,
  ],
  providers: [
    DepartmentService,
    GlobalConfigService,
    CandidateFormService,
    InterviewerService,
    QuestionTemplateService,
  ],
})
export class RecruitingSetupModule {}
