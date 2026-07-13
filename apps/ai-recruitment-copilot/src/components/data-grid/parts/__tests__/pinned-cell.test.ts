import { describe, expect, it } from "vitest";
import { PINNED_HEADER_CLASS, STICKY_HEADER_CLASS } from "../pinned-cell";

describe("pinned table headers", () => {
  it("uses the opaque equivalent of the CardFrame header surface", () => {
    const opaqueHeaderSurface = "bg-[color-mix(in_srgb,var(--card)_28%,var(--muted)_72%)]";

    expect(PINNED_HEADER_CLASS).toContain(opaqueHeaderSurface);
    expect(STICKY_HEADER_CLASS).toContain(opaqueHeaderSurface);
    expect(PINNED_HEADER_CLASS).not.toMatch(/\/(?:\d+)/);
  });
});
