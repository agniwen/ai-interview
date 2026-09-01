import { Inject, Injectable } from "@nestjs/common";

import type { DrainParticipant } from "../../../runtime/drain-coordinator.service.js";
import {
  DRAIN_ORDER,
  DrainCoordinatorService,
} from "../../../runtime/drain-coordinator.service.js";
import { closeRecruitingMastraStorage } from "./recruiting-copilot.js";

export function createRecruitingMastraDrainParticipant(
  close: () => Promise<void> = closeRecruitingMastraStorage,
): DrainParticipant {
  return {
    drain: close,
    name: "mastra-postgres",
    order: DRAIN_ORDER.database,
  };
}

@Injectable()
export class RecruitingMastraLifecycleService {
  constructor(
    @Inject(DrainCoordinatorService)
    drainCoordinator: DrainCoordinatorService,
  ) {
    drainCoordinator.register(createRecruitingMastraDrainParticipant());
  }
}
