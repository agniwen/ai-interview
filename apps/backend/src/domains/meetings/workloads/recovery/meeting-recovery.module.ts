/* oxlint-disable typescript/no-extraneous-class -- Nest modules are declarative classes. */
import { Module } from "@nestjs/common";
import { BackgroundQueueModule } from "../../../../background/background-queue.module.js";
import { BackendConfigModule } from "../../../../config/backend-config.module.js";
import { DatabaseModule } from "../../../../infrastructure/database/database.module.js";
import { MEETING_RECOVERY_COMMANDS } from "./meeting-recovery.commands.js";
import { MeetingRecoveryScheduler } from "./meeting-recovery.scheduler.js";
import { MeetingRecoveryService } from "./meeting-recovery.service.js";

@Module({
  exports: [MEETING_RECOVERY_COMMANDS, MeetingRecoveryScheduler],
  imports: [BackgroundQueueModule, BackendConfigModule, DatabaseModule],
  providers: [
    { provide: MEETING_RECOVERY_COMMANDS, useClass: MeetingRecoveryService },
    MeetingRecoveryScheduler,
  ],
})
export class MeetingRecoveryModule {}
