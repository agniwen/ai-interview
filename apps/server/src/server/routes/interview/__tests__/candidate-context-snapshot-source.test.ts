import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("../route.ts", import.meta.url), "utf-8");
const utilsSource = readFileSync(new URL("../utils.ts", import.meta.url), "utf-8");

describe("candidate interview context snapshot source", () => {
  it("does not create context snapshots from candidate-facing interview endpoints", () => {
    expect(routeSource).not.toContain("loadOrCreateActiveInterviewContextSnapshot");
    expect(utilsSource).not.toContain("loadOrCreateActiveInterviewContextSnapshot");
    expect(routeSource).toContain("loadActiveInterviewContextSnapshot");
    expect(utilsSource).toContain("loadActiveInterviewContextSnapshot");
  });
});
