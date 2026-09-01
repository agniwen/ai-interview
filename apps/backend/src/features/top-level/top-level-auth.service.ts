/* oxlint-disable anti-slop/require-safety-comment-for-type-assertion, class-methods-use-this -- Request authentication helpers implement the injectable authorization port and narrow session fields after Better Auth middleware populates the request. */
import { rawBackendEnvironment } from "../../config/raw-backend-environment.js";
import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import type { TopLevelActor, TopLevelAuthPort } from "./top-level.ports.js";

@Injectable()
export class TopLevelAuthService implements TopLevelAuthPort {
  actor(request: Request): TopLevelActor | null {
    const user = request.authContext?.user;
    return user?.id ? { id: user.id } : null;
  }

  requireActor(request: Request): TopLevelActor {
    const actor = this.actor(request);
    if (!actor) {
      throw new UnauthorizedException("Authentication required", {
        errorCode: "AUTHENTICATION_REQUIRED",
      });
    }
    return actor;
  }

  requireAgent(request: Request): void {
    const expected = rawBackendEnvironment.AGENT_CALLBACK_SECRET?.trim();
    const received = request.header("x-agent-secret")?.trim();
    if (!(expected && received && received === expected)) {
      throw new UnauthorizedException("Invalid agent credentials", {
        errorCode: "AGENT_AUTHENTICATION_FAILED",
      });
    }
  }

  requirePlatformAdministrator(request: Request): TopLevelActor {
    const actor = this.requireActor(request);
    const role = (request.authContext?.user as { role?: string } | undefined)?.role;
    if (role !== "admin") {
      throw new ForbiddenException("Platform administrator access required", {
        errorCode: "PLATFORM_ADMIN_REQUIRED",
      });
    }
    return actor;
  }
}
