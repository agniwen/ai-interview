import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./tabs.tsx", import.meta.url), "utf-8");

describe("Tabs coss implementation", () => {
  it("uses the coss Base UI indicator structure instead of the old motion indicator", () => {
    expect(source).toContain('import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";');
    expect(source).toContain("<TabsPrimitive.Indicator");
    expect(source).toContain('data-slot="tab-indicator"');
    expect(source).toContain("--active-tab-height");
    expect(source).toContain("--active-tab-width");
    expect(source).not.toContain('from "motion/react"');
    expect(source).not.toContain("<motion.span");
    expect(source).not.toContain("<motion.div");
  });

  it("keeps local compatibility aliases and activation mode support", () => {
    expect(source).toContain('export type TabsVariant = "default" | "underline";');
    expect(source).toContain('type TabsListVariant = TabsVariant | "line";');
    expect(source).toContain('variant === "line" ? "underline" : variant');
    expect(source).toContain("activationMode?: TabsActivationMode;");
    expect(source).toContain('activateOnFocus={activateOnFocus ?? activationMode === "automatic"}');
    expect(source).toContain("TabsPanel as TabsContent");
    expect(source).toContain("TabsTab as TabsTrigger");
    expect(source).toContain("keepMounted={keepMounted ?? forceMount}");
  });

  it("keeps the default and underline coss visual variants", () => {
    expect(source).toContain("rounded-lg bg-muted p-0.5 text-muted-foreground/72");
    expect(source).toContain("data-[orientation=horizontal]:py-1");
    expect(source).toContain("data-active:text-foreground");
    expect(source).toContain("rounded-md bg-background shadow-sm/5 dark:bg-input");
    expect(source).toContain("bg-primary data-[orientation=horizontal]:h-0.5");
  });
});
