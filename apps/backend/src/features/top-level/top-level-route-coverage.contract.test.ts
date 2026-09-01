/* oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion, unicorn/no-await-expression-member -- The parity test reflects trusted Nest decorator metadata and normalizes its framework-owned route argument shapes before comparison. */
import "reflect-metadata";

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { TOP_LEVEL_CONTROLLERS } from "./top-level-features.module.js";

interface InventoryContract {
  method: string;
  path: string;
}

interface InventoryShard {
  contracts: InventoryContract[];
}

const TOP_LEVEL_ROUTE_PATTERN =
  /^\/api\/(agent|livekit|meeting-local-recovery|resume|interview|platform|public|join)(\/|$)/u;

function normalizePath(...segments: string[]): string {
  return `/${segments
    .flatMap((segment) => segment.split("/"))
    .filter(Boolean)
    .join("/")}`;
}

function discoverNestRoutes(): string[] {
  const routes: string[] = [];
  for (const controller of TOP_LEVEL_CONTROLLERS) {
    const basePath = Reflect.getMetadata(PATH_METADATA, controller) as string;
    const prototype = controller.prototype as unknown as Record<string, unknown>;
    for (const methodName of Object.getOwnPropertyNames(prototype)) {
      const handler = prototype[methodName];
      if (typeof handler !== "function") {
        continue;
      }
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      if (method === undefined || path === undefined) {
        continue;
      }
      routes.push(`${RequestMethod[method]} ${normalizePath(basePath, path)}`);
    }
  }
  return routes.toSorted();
}

const RESPONSE_SCHEMA_METADATA = "class_serializer:options";
const BODYLESS_OR_BINARY_HANDLERS = new Set([
  "MeetingLocalRecoveryController.cleanup",
  "PublicController.roundResume",
  "PublicController.roundResumePreview",
  "PublicController.voicePreview",
  "PublicHumanInterviewCandidateMaterialsController.resume",
  "PublicHumanInterviewCandidateMaterialsController.resumePreview",
]);

function discoverJsonHandlersWithoutSchemas() {
  const missing: string[] = [];
  for (const controller of TOP_LEVEL_CONTROLLERS) {
    const prototype = controller.prototype as unknown as Record<string, unknown>;
    for (const methodName of Object.getOwnPropertyNames(prototype)) {
      const handler = prototype[methodName];
      if (
        typeof handler !== "function" ||
        Reflect.getMetadata(METHOD_METADATA, handler) === undefined
      ) {
        continue;
      }
      const key = `${controller.name}.${methodName}`;
      if (
        !BODYLESS_OR_BINARY_HANDLERS.has(key) &&
        !Reflect.getOwnMetadata(RESPONSE_SCHEMA_METADATA, handler)?.schema
      ) {
        missing.push(key);
      }
    }
  }
  return missing;
}

async function loadInventoryRoutes(): Promise<string[]> {
  const inventoryDirectory = join(import.meta.dirname, "../../../migration/http-contracts");
  const shardFiles = (await readdir(inventoryDirectory))
    .filter((name) => /^part-\d+\.json$/u.test(name))
    .toSorted();
  const routes: string[] = [];
  for (const name of shardFiles) {
    const shard = JSON.parse(
      await readFile(join(inventoryDirectory, name), "utf-8"),
    ) as InventoryShard;
    for (const contract of shard.contracts) {
      if (TOP_LEVEL_ROUTE_PATTERN.test(contract.path)) {
        routes.push(`${contract.method} ${contract.path}`);
      }
    }
  }
  return routes.toSorted();
}

describe("top-level HTTP route coverage", () => {
  it("registers every top-level route in the migration contract inventory", async () => {
    const inventoryRoutes = await loadInventoryRoutes();
    const nestRoutes = discoverNestRoutes();

    expect(inventoryRoutes).toHaveLength(68);
    expect(nestRoutes).toEqual(inventoryRoutes);
  });

  it("declares a method-level Standard Schema for every JSON response", () => {
    expect(discoverJsonHandlersWithoutSchemas()).toEqual([]);
  });
});
