import { describe, expect, it } from "vitest";
import {
  discardUpgradeDraftSchema,
  publishUpgradeDraftSchema,
  updateUpgradeDraftSchema,
} from "./schema";
import { createDefaultJobDescriptionStructuredConfig } from "@app/db-schema/job-description-structured-config";

describe("job evaluation upgrade schemas", () => {
  it("requires an explicit irreversible publish confirmation", () => {
    expect(
      publishUpgradeDraftSchema.safeParse({
        confirmedBlueprintHash: "hash",
        expectedVersion: 1,
        explicitConfirmation: false,
      }).success,
    ).toBe(false);
    expect(
      publishUpgradeDraftSchema.safeParse({
        confirmedBlueprintHash: "hash",
        expectedVersion: 1,
        explicitConfirmation: true,
      }).success,
    ).toBe(true);
  });

  it("coerces the delete query version and rejects non-positive versions", () => {
    expect(discardUpgradeDraftSchema.parse({ expectedVersion: "2" }).expectedVersion).toBe(2);
    expect(discardUpgradeDraftSchema.safeParse({ expectedVersion: "0" }).success).toBe(false);
  });

  it("rejects unexpected upgrade draft fields", () => {
    expect(
      updateUpgradeDraftSchema.safeParse({
        expectedVersion: 1,
        prompt: "岗位 JD",
        publishedAt: "2026-08-04T00:00:00.000Z",
        structuredConfig: createDefaultJobDescriptionStructuredConfig(),
      }).success,
    ).toBe(false);
  });
});
