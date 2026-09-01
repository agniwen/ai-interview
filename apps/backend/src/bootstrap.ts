import "reflect-metadata";

import {
  ConsoleLogger,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
} from "@nestjs/common";
import type { INestApplication, LoggerService, LogLevel } from "@nestjs/common";
import { HttpAdapterHost, NestFactory, Reflector } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import { toNodeHandler } from "better-auth/node";
import express from "express";
import type { Express } from "express";
import { AppModule } from "./app.module.js";
import { BACKEND_AUTH } from "./auth/auth.tokens.js";
import type { BackendAuth } from "./auth/better-auth.factory.js";
import { MachineReadableHttpExceptionFilter } from "./infrastructure/http/machine-readable-http-exception.filter.js";
import { createBackendOpenApiDocument } from "./openapi/create-openapi-document.js";

export { createBackendOpenApiDocument } from "./openapi/create-openapi-document.js";

export interface BackendApplicationOptions {
  backgroundWorkersEnabled?: boolean;
  logger?: false | LoggerService | LogLevel[];
  readinessDatabaseCheck?: boolean;
}

export async function createBackendApplication(
  options: BackendApplicationOptions = {},
): Promise<INestApplication> {
  if (options.backgroundWorkersEnabled !== undefined) {
    process.env.BACKGROUND_WORKERS_ENABLED = String(options.backgroundWorkersEnabled);
  }
  if (options.readinessDatabaseCheck !== undefined) {
    process.env.READINESS_DATABASE_CHECK_ENABLED = String(options.readinessDatabaseCheck);
  }

  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger:
      options.logger ??
      new ConsoleLogger({
        colors: process.env.NODE_ENV !== "production",
        json: process.env.NODE_ENV === "production",
        prefix: "arc-backend",
      }),
    routeConflictPolicy: { duplicate: "error", shadow: "warn" },
    routeResolutionStrategy: "specificity",
  });

  // SAFETY: Nest's Express adapter owns an Express application instance at this bootstrap boundary.
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.all("/api/auth/*splat", toNodeHandler(app.get<BackendAuth>(BACKEND_AUTH)));
  expressApp.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "10mb" }));
  expressApp.use(express.urlencoded({ extended: true }));

  const trustedOrigins = new Set(
    [
      process.env.BETTER_AUTH_URL,
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5174",
      ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? []),
      ...(process.env.TRUSTED_ORIGINS?.split(",") ?? []),
    ]
      .map((origin) => origin?.trim())
      .filter((origin): origin is string => Boolean(origin)),
  );
  app.enableCors({
    credentials: true,
    origin: [...trustedOrigins],
  });

  app.useGlobalFilters(new MachineReadableHttpExceptionFilter(app.get(HttpAdapterHost)));
  app.useGlobalPipes(new StandardSchemaValidationPipe({ transform: true }));
  app.useGlobalInterceptors(new StandardSchemaSerializerInterceptor(app.get(Reflector)));
  app.enableShutdownHooks();
  await app.init();
  return app;
}

export async function listenBackendApplication(): Promise<INestApplication> {
  const app = await createBackendApplication();
  const host = process.env.HOST?.trim() || "0.0.0.0";
  const port = Number.parseInt(process.env.PORT?.trim() || "8787", 10);

  if (process.env.NODE_ENV !== "production") {
    SwaggerModule.setup("api/docs", app, createBackendOpenApiDocument(app));
  }

  await app.listen(port, host);
  return app;
}
