/* oxlint-disable max-classes-per-file -- Minimal decorated provider doubles intentionally stay beside the Nest module wiring contract they verify. */
import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterEach, describe, expect, it } from "vitest";
import { API_DATABASE } from "../../infrastructure/database/database.tokens.js";
import { TopLevelFeaturesModule } from "./top-level-features.module.js";

@Global()
@Module({ exports: [API_DATABASE], providers: [{ provide: API_DATABASE, useValue: {} }] })
class TestDatabaseModule {}

@Module({ imports: [TestDatabaseModule, TopLevelFeaturesModule] })
class TestApplicationModule {}

describe("TopLevelFeaturesModule", () => {
  let application: Awaited<ReturnType<typeof NestFactory.create>> | undefined;

  afterEach(async () => {
    await application?.close();
  });

  it("initializes with its concrete business adapters", async () => {
    application = await NestFactory.create(TestApplicationModule, { logger: false });
    await expect(application.init()).resolves.toBe(application);
  });
});
