/* oxlint-disable typescript/no-extraneous-class -- Nest modules are declarative classes. */
import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { WorkspaceAccessHttpModule } from "../../infrastructure/http/workspace-access/index.js";
import { InviteLinkController } from "./invite-links/invite-link.controller.js";
import { InviteLinkService } from "./invite-links/invite-link.service.js";
import { JoinEffectsService } from "./join/join-effects.service.js";
import { JoinNotificationService } from "./join/join-notification.service.js";
import { JoinController } from "./join/join.controller.js";
import { JOIN_EFFECTS_PORT, JOIN_NOTIFICATION_PORT, JOIN_PORT } from "./join/join.port.js";
import { JoinService } from "./join/join.service.js";
import { WorkspaceMembersController } from "./members/workspace-members.controller.js";
import { WorkspaceMembersService } from "./members/workspace-members.service.js";
import { WorkspaceSettingsController } from "./settings/workspace-settings.controller.js";
import { WorkspaceSettingsService } from "./settings/workspace-settings.service.js";
import { HttpInfrastructureModule } from "../../infrastructure/http/http-infrastructure.module.js";
import { WorkspaceInfrastructureModule } from "../../infrastructure/workspace/workspace-infrastructure.module.js";

@Module({
  controllers: [
    InviteLinkController,
    WorkspaceMembersController,
    WorkspaceSettingsController,
    JoinController,
  ],
  imports: [
    AuthModule,
    HttpInfrastructureModule,
    WorkspaceAccessHttpModule,
    WorkspaceInfrastructureModule,
  ],
  providers: [
    InviteLinkService,
    WorkspaceMembersService,
    WorkspaceSettingsService,
    { provide: JOIN_EFFECTS_PORT, useClass: JoinEffectsService },
    { provide: JOIN_NOTIFICATION_PORT, useClass: JoinNotificationService },
    { provide: JOIN_PORT, useClass: JoinService },
  ],
})
export class IdentityAccessModule {}
