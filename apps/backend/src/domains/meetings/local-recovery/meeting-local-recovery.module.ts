import { Module } from "@nestjs/common";
import { HttpInfrastructureModule } from "../../../infrastructure/http/http-infrastructure.module.js";
import { MeetingLocalRecoveryController } from "./meeting-local-recovery.controller.js";
import { MEETING_LOCAL_RECOVERY_PORT } from "./meeting-local-recovery.port.js";
import { MeetingLocalRecoveryService } from "./meeting-local-recovery.service.js";

@Module({
  controllers: [MeetingLocalRecoveryController],
  imports: [HttpInfrastructureModule],
  providers: [
    {
      provide: MEETING_LOCAL_RECOVERY_PORT,
      useClass: MeetingLocalRecoveryService,
    },
  ],
})
export class MeetingLocalRecoveryModule {}
