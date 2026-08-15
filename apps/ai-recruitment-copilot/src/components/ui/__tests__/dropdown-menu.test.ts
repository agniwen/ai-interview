import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dropdownMenuSource = readFileSync(new URL("../dropdown-menu.tsx", import.meta.url), "utf-8");
const desktopDropdownMenuSource = readFileSync(
  new URL(
    "../../../../../ai-recruitment-copilot-desktop/src/renderer/src/components/ui/dropdown-menu.tsx",
    import.meta.url,
  ),
  "utf-8",
);

describe("DropdownMenuContent", () => {
  it("uses Base UI's ending-style state so a menu remains mounted for its exit animation", () => {
    for (const source of [dropdownMenuSource, desktopDropdownMenuSource]) {
      expect(source).toContain("transition-[scale,opacity]");
      expect(source).toContain("duration-200");
      expect(source).toContain("ease-[cubic-bezier(0.22,1,0.36,1)]");
      expect(source).toContain("data-starting-style:opacity-0");
      expect(source).toContain("data-starting-style:scale-95");
      expect(source).toContain("data-ending-style:opacity-0");
      expect(source).toContain("data-ending-style:scale-95");
    }
  });
});
