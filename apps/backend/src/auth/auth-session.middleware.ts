import { Inject, Injectable } from "@nestjs/common";
import type { NestMiddleware } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, Response } from "express";
import { BACKEND_AUTH } from "./auth.tokens.js";
import type { BackendAuth } from "./better-auth.factory.js";

@Injectable()
export class AuthSessionMiddleware implements NestMiddleware {
  private readonly auth: BackendAuth;

  constructor(@Inject(BACKEND_AUTH) auth: BackendAuth) {
    this.auth = auth;
  }

  async use(request: Request, _response: Response, next: NextFunction): Promise<void> {
    const authSession = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    request.authContext = authSession
      ? { session: authSession.session, user: authSession.user }
      : null;
    next();
  }
}
