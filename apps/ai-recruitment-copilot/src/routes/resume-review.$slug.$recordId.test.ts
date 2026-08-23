import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("resume review detail tabs", () => {
  it("renders the shared overview and AI score tab controls", async () => {
    const routeSource = await readFile(
      new URL("resume-review.$slug.$recordId.tsx", import.meta.url),
      "utf-8",
    );

    expect(routeSource).toContain("shell={({ body, headerExtra, title }) =>");
    expect(routeSource).toContain("{headerExtra}");
  });
});
