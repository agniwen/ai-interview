/* oxlint-disable typescript/no-extraneous-class -- Nest modules are declarative classes. */
import { Module } from "@nestjs/common";
import { BackgroundQueueModule } from "../../../../background/background-queue.module.js";
import { BackendConfigModule } from "../../../../config/backend-config.module.js";
import { DatabaseModule } from "../../../../infrastructure/database/database.module.js";
import { CANDIDATE_RECOVERY_COMMANDS } from "./candidate-recovery.commands.js";
import { CandidateRecoveryScheduler } from "./candidate-recovery.scheduler.js";
import { CandidateRecoveryService } from "./candidate-recovery.service.js";

@Module({
  exports: [CANDIDATE_RECOVERY_COMMANDS, CandidateRecoveryScheduler],
  imports: [BackgroundQueueModule, BackendConfigModule, DatabaseModule],
  providers: [
    { provide: CANDIDATE_RECOVERY_COMMANDS, useClass: CandidateRecoveryService },
    CandidateRecoveryScheduler,
  ],
})
export class CandidateRecoveryModule {}
