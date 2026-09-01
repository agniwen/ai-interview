import "reflect-metadata";

import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { MetadataScanner } from "@nestjs/core/metadata-scanner";
import { describe, expect, it } from "vitest";
import { API_ROOT_CONTROLLERS } from "./api-root.controllers.js";

const NON_WORKSPACE_ROUTE_PATTERN = /^\/(?:public|system)\//u;
const metadataScanner = new MetadataScanner();

function normalizePath(...segments: string[]): string {
  return `/${segments
    .flatMap((segment) => segment.split("/"))
    .filter(Boolean)
    .join("/")}`;
}

function discoverNestRoutes(): string[] {
  const routes: string[] = [];
  for (const controller of API_ROOT_CONTROLLERS) {
    const basePath = Reflect.getMetadata(PATH_METADATA, controller);
    for (const methodName of metadataScanner.getAllMethodNames(controller.prototype)) {
      const handler = Object.getOwnPropertyDescriptor(controller.prototype, methodName)?.value;
      if (!handler) {
        continue;
      }
      const method = Reflect.getMetadata(METHOD_METADATA, handler);
      const path = Reflect.getMetadata(PATH_METADATA, handler);
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
  "PublicInterviewerVoicePreviewController.get",
  "PublicHumanInterviewCandidateMaterialsController.resume",
  "PublicHumanInterviewCandidateMaterialsController.resumePreview",
]);

function discoverJsonHandlersWithoutSchemas() {
  const missing: string[] = [];
  for (const controller of API_ROOT_CONTROLLERS) {
    for (const methodName of metadataScanner.getAllMethodNames(controller.prototype)) {
      const handler = Object.getOwnPropertyDescriptor(controller.prototype, methodName)?.value;
      if (!handler) {
        continue;
      }
      if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined) {
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

describe("non-workspace HTTP route coverage", () => {
  it("registers every public and system adapter under an explicit route family", () => {
    const nestRoutes = discoverNestRoutes();

    expect(nestRoutes).toHaveLength(68);
    expect(
      nestRoutes.every((route) =>
        NON_WORKSPACE_ROUTE_PATTERN.test(route.slice(route.indexOf(" ") + 1)),
      ),
    ).toBe(true);
  });

  it("declares a method-level Standard Schema for every JSON response", () => {
    expect(discoverJsonHandlersWithoutSchemas()).toEqual([]);
  });
});
