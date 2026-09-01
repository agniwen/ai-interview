import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

type CorrelatedRequest = Request & { correlationId: string };

@Injectable()
export class RequestCorrelationMiddleware implements NestMiddleware {
  use(request: CorrelatedRequest, response: Response, next: NextFunction): void {
    void this;
    const suppliedId = request.header("x-request-id")?.trim();
    request.correlationId = suppliedId || randomUUID();
    response.setHeader("x-request-id", request.correlationId);
    next();
  }
}
