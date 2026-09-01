import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../infrastructure/database/database.module.js";
import { IDENTITY_ADMINISTRATION_COMMANDS } from "./identity-administration.commands.js";
import { IdentityAdministrationService } from "./identity-administration.service.js";

@Module({
  exports: [IDENTITY_ADMINISTRATION_COMMANDS],
  imports: [DatabaseModule],
  providers: [
    { provide: IDENTITY_ADMINISTRATION_COMMANDS, useClass: IdentityAdministrationService },
  ],
})
export class IdentityAdministrationModule {}
