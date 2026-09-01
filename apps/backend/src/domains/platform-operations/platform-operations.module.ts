import { Module } from "@nestjs/common";
import { HttpInfrastructureModule } from "../../infrastructure/http/http-infrastructure.module.js";
import { CandidateLifecycleModule } from "../candidate-lifecycle/candidate-lifecycle.module.js";
import { IdentityAdministrationModule } from "../identity-access/administration/identity-administration.module.js";
import { IdentityOperationalReadModelService } from "./infrastructure/identity-operational-read-model.service.js";
import { IDENTITY_OPERATIONAL_READ_MODEL } from "./infrastructure/operational-read-model.port.js";
import { PLATFORM_OPERATIONAL_READ_MODEL } from "./infrastructure/platform-operational-read-model.port.js";
import { PlatformOperationalReadModelService } from "./infrastructure/platform-operational-read-model.service.js";
import { PlatformController } from "./http/platform.controller.js";
import { PlatformOperationsService } from "./http/platform-operations.service.js";
import { PLATFORM_OPERATIONS_PORT, PLATFORM_PORT } from "./http/platform.port.js";
import { PlatformService } from "./http/platform.service.js";

@Module({
  controllers: [PlatformController],
  imports: [CandidateLifecycleModule, HttpInfrastructureModule, IdentityAdministrationModule],
  providers: [
    {
      provide: IDENTITY_OPERATIONAL_READ_MODEL,
      useClass: IdentityOperationalReadModelService,
    },
    {
      provide: PLATFORM_OPERATIONS_PORT,
      useClass: PlatformOperationsService,
    },
    {
      provide: PLATFORM_OPERATIONAL_READ_MODEL,
      useClass: PlatformOperationalReadModelService,
    },
    { provide: PLATFORM_PORT, useClass: PlatformService },
  ],
})
export class PlatformOperationsModule {}
