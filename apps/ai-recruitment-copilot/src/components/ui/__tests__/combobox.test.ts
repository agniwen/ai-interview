import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const comboboxSource = readFileSync(new URL("../combobox.tsx", import.meta.url), "utf-8");
const desktopComboboxSource = readFileSync(
  new URL(
    "../../../../../ai-recruitment-copilot-desktop/src/renderer/src/components/ui/combobox.tsx",
    import.meta.url,
  ),
  "utf-8",
);

describe("ComboboxContent", () => {
  it("uses Base UI lifecycle states for its opening and closing transition", () => {
    for (const source of [comboboxSource, desktopComboboxSource]) {
      expect(source).toContain("transition-[scale,opacity]");
      expect(source).toContain("duration-200");
      expect(source).toContain("ease-[cubic-bezier(0.22,1,0.36,1)]");
      expect(source).toContain("data-starting-style:opacity-0");
      expect(source).toContain("data-starting-style:scale-95");
      expect(source).toContain("data-ending-style:opacity-0");
      expect(source).toContain("data-ending-style:scale-95");
      expect(source).not.toContain("data-open:animate-in");
      expect(source).not.toContain("data-closed:animate-out");
    }
  });
});
