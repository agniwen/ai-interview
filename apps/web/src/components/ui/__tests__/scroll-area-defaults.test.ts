import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scrollAreaSource = readFileSync(new URL("../scroll-area.tsx", import.meta.url), "utf-8");
const bodyScrollAreaSource = readFileSync(
  new URL("../../layout/overlay-scrollbars-body.tsx", import.meta.url),
  "utf-8",
);
const studioLayoutSource = readFileSync(
  new URL("../../../routes/w.$slug.studio.tsx", import.meta.url),
  "utf-8",
);

describe("ScrollArea defaults", () => {
  it("auto-hides scrollbars after scrolling becomes inactive", () => {
    expect(scrollAreaSource).toContain('scrollbars = "scroll"');
  });

  it("uses the same inactivity behavior for page-level scroll containers", () => {
    expect(bodyScrollAreaSource).toContain('autoHide: "scroll"');
    expect(studioLayoutSource).not.toContain('scrollbars="never"');
  });
});
