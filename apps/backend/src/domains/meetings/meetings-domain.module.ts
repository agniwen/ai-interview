/* oxlint-disable typescript/no-extraneous-class -- Nest modules are declarative classes. */
import { Module } from "@nestjs/common";
import { MeetingRecoveryModule } from "./workloads/recovery/meeting-recovery.module.js";
import { MeetingLocalRecoveryModule } from "./local-recovery/meeting-local-recovery.module.js";
import { MeetingSessionsModule } from "./sessions/meeting-sessions.module.js";

@Module({ imports: [MeetingSessionsModule, MeetingLocalRecoveryModule, MeetingRecoveryModule] })
export class MeetingsDomainModule {}
