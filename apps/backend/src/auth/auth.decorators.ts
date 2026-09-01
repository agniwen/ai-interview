import { createParamDecorator, UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { AuthContext } from "./auth.types.js";

export const CurrentAuth = createParamDecorator(
  (_data: undefined, context: ExecutionContext): AuthContext => {
    const auth = context.switchToHttp().getRequest<Request>().authContext;
    if (!auth) {
      throw new UnauthorizedException("Authentication required", {
        errorCode: "AUTHENTICATION_REQUIRED",
      });
    }
    return auth;
  },
);
