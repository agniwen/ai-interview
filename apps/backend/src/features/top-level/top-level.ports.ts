import type { Request } from "express";
import type { Database } from "../../infrastructure/database/database.tokens.js";

export const TOP_LEVEL_AUTH_PORT = Symbol("TOP_LEVEL_AUTH_PORT");
export const TOP_LEVEL_DATABASE_PORT = Symbol("TOP_LEVEL_DATABASE_PORT");
export type TopLevelDatabasePort = Database;

export interface TopLevelActor {
  id: string;
}

export interface TopLevelAuthPort {
  actor(request: Request): TopLevelActor | null;
  requireActor(request: Request): TopLevelActor;
  requireAgent(request: Request): void;
  requirePlatformAdministrator(request: Request): TopLevelActor;
}

export interface TopLevelBinaryResponse {
  body: Buffer | Uint8Array | NodeJS.ReadableStream;
  headers: Record<string, string>;
}

export type TopLevelResponse = object | string | number | boolean | null;
