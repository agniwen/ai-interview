import { Inject, Injectable } from "@nestjs/common";
import { CandidateRecoveryScheduler } from "../domains/candidate-lifecycle/workloads/recovery/candidate-recovery.scheduler.js";
import { MeetingRecoveryScheduler } from "../domains/meetings/workloads/recovery/meeting-recovery.scheduler.js";
import type { MeetingRecoverySnapshot } from "../domains/meetings/workloads/recovery/meeting-recovery.scheduler.js";

export type BackgroundRecoverySnapshot = MeetingRecoverySnapshot;

@Injectable()
export class BackgroundRecoveryService {
  constructor(
    @Inject(CandidateRecoveryScheduler)
    private readonly candidateRecovery: CandidateRecoveryScheduler,
    @Inject(MeetingRecoveryScheduler)
    private readonly meetingRecovery: MeetingRecoveryScheduler,
  ) {}

  async start(input: { transcription: boolean }): Promise<void> {
    await this.candidateRecovery.start();
    await this.meetingRecovery.start(input);
  }

  getSnapshot(): MeetingRecoverySnapshot {
    return this.meetingRecovery.getSnapshot();
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.candidateRecovery.close(), this.meetingRecovery.close()]);
  }
}
