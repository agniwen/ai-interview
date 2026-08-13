import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("router scroll restoration", () => {
  it("resets the studio viewport when navigating to recruiter resume detail", async () => {
    const routerSource = await readFile(new URL("router.tsx", import.meta.url), "utf-8");

    expect(routerSource).toContain(
      "scrollToTopSelectors: [getRecruiterResumeDetailScrollToTopElement]",
    );
  });
});
