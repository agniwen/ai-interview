import type { Request } from "express";
import type { Database } from "../../infrastructure/database/database.tokens.js";

export const HTTP_REQUEST_AUTH = Symbol("HTTP_REQUEST_AUTH");
export const HTTP_DATABASE = Symbol("HTTP_DATABASE");
export type HttpDatabase = Database;

export interface HttpActor {
  id: string;
}

export interface HttpRequestAuth {
  actor(request: Request): HttpActor | null;
  requireActor(request: Request): HttpActor;
  requireAgent(request: Request): void;
  requirePlatformAdministrator(request: Request): HttpActor;
}

export interface HttpBinaryResponse {
  body: Buffer | Uint8Array | NodeJS.ReadableStream;
  headers: Record<string, string>;
}

export type HttpResponse = object | string | number | boolean | null;
