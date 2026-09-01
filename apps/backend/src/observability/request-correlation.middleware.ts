import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { runWithCorrelationScope } from "./request-correlation.context.js";

export type CorrelatedRequest = Request & { correlationId?: string };

@Injectable()
export class RequestCorrelationMiddleware implements NestMiddleware {
  use(request: CorrelatedRequest, response: Response, next: NextFunction): void {
    void this;
    const suppliedId = request.header("x-request-id")?.trim();
    const correlationId = request.correlationId || suppliedId || randomUUID();
    request.correlationId = correlationId;
    response.setHeader("x-request-id", correlationId);
    runWithCorrelationScope(correlationId, next);
  }
}
