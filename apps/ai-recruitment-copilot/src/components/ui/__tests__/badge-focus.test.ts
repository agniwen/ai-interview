import { describe, expect, it } from "vitest";
import { badgeVariants } from "../badge";

describe("badge focus styles", () => {
  it.each(["default", "destructive"] as const)(
    "keeps a focus border without a ring for the %s variant",
    (variant) => {
      const className = badgeVariants({ variant });

      expect(className).toContain("focus-visible:border-ring");
      expect(className).not.toContain("focus-visible:ring");
      expect(className).not.toContain("focus-within:ring");
      expect(className).not.toContain("focus:ring");
    },
  );
});
