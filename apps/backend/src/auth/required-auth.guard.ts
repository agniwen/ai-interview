import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

@Injectable()
export class RequiredAuthGuard implements CanActivate {
  // oxlint-disable-next-line class-methods-use-this -- Nest calls guards through this interface.
  canActivate(context: ExecutionContext): boolean {
    if (!context.switchToHttp().getRequest<Request>().authContext) {
      throw new UnauthorizedException("Authentication required", {
        errorCode: "AUTHENTICATION_REQUIRED",
      });
    }
    return true;
  }
}
