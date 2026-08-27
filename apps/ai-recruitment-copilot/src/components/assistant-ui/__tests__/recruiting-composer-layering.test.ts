import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const threadSource = readFileSync(new URL("../recruiting-thread.tsx", import.meta.url), "utf-8");
const popoverSource = readFileSync(
  new URL("../composer-trigger-popover.tsx", import.meta.url),
  "utf-8",
);

describe("recruiting composer layering", () => {
  it("keeps the mention dropdown above cards in the scrollable message viewport", () => {
    expect(threadSource).toContain(
      'className="aui-thread-footer sticky bottom-0 z-30 bg-background px-4 pb-3"',
    );
    expect(popoverSource).toContain("z-[60]");
  });
});
