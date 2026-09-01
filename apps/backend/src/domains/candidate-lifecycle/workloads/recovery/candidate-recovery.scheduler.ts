import { Inject, Injectable, Logger } from "@nestjs/common";
import { BackgroundQueueProducerService } from "../../../../background/background-queue-producer.service.js";
import { BackendConfigService } from "../../../../config/backend-config.service.js";
import { CANDIDATE_RECOVERY_COMMANDS } from "./candidate-recovery.commands.js";
import type { CandidateRecoveryCommands } from "./candidate-recovery.commands.js";

const closeCandidateRecovery = (): Promise<void> => Promise.resolve();

@Injectable()
export class CandidateRecoveryScheduler {
  private readonly logger = new Logger(CandidateRecoveryScheduler.name);
  private readonly resumeSemanticIndexEnabled: boolean;

  constructor(
    @Inject(CANDIDATE_RECOVERY_COMMANDS)
    private readonly recovery: CandidateRecoveryCommands,
    @Inject(BackgroundQueueProducerService)
    private readonly queueProducer: BackgroundQueueProducerService,
    @Inject(BackendConfigService) config: BackendConfigService,
  ) {
    this.resumeSemanticIndexEnabled = config.get("RESUME_SEMANTIC_INDEX_ENABLED");
  }

  async start(): Promise<void> {
    const parseJobs = await this.recovery.listRecoverableResumeParseJobs();
    await this.queueProducer.enqueueResumeParseJobs(parseJobs);
    this.logger.log("Resume parse startup recovery completed", { count: parseJobs.length });
    if (!this.resumeSemanticIndexEnabled) {
      return;
    }
    const semanticJobs = await this.recovery.listRecoverableResumeSemanticIndexJobs();
    await this.queueProducer.enqueueResumeSemanticIndexJobs(semanticJobs);
    this.logger.log("Resume semantic index startup recovery completed", {
      count: semanticJobs.length,
    });
  }

  readonly close = closeCandidateRecovery;
}
