/* oxlint-disable typescript/no-extraneous-class -- Nest modules are declarative classes. */
import { Module } from "@nestjs/common";
import { BackgroundQueueModule } from "../../background/background-queue.module.js";
import { DatabaseModule } from "../../infrastructure/database/database.module.js";
import { CandidateLifecycleModule } from "../candidate-lifecycle/candidate-lifecycle.module.js";
import { WorkspaceAccessHttpModule } from "../../infrastructure/http/workspace-access/index.js";
import { WorkspaceInfrastructureModule } from "../../infrastructure/workspace/workspace-infrastructure.module.js";
import { JobDescriptionController } from "./job-descriptions/job-description.controller.js";
import { JobDescriptionService } from "./job-descriptions/job-description.service.js";
import { JobEvaluationLifecycleController } from "./job-descriptions/job-evaluation-lifecycle.controller.js";
import { JobEvaluationLifecycleService } from "./job-descriptions/job-evaluation-lifecycle.service.js";

@Module({
  controllers: [JobDescriptionController, JobEvaluationLifecycleController],
  imports: [
    BackgroundQueueModule,
    DatabaseModule,
    CandidateLifecycleModule,
    WorkspaceAccessHttpModule,
    WorkspaceInfrastructureModule,
  ],
  providers: [JobDescriptionService, JobEvaluationLifecycleService],
})
export class JobsModule {}
