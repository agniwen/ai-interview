import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const rendererRoot = join(import.meta.dirname, "../..");
const readRendererSource = (path: string) => readFileSync(join(rendererRoot, path), "utf-8");

describe("desktop shared motion primitives", () => {
  it("defines intent-based motion tokens and reduced-motion fallbacks", () => {
    const styles = readRendererSource("assets/main.css");

    expect(styles).toContain("--duration-quick: 150ms");
    expect(styles).toContain("--duration-fast: 250ms");
    expect(styles).toContain("--ease-smooth-out: cubic-bezier(0.22, 1, 0.36, 1)");
    expect(styles).toMatch(
      /\.t-dropdown\s*\{[^}]*transform-origin: var\(--transform-origin\);[^}]*transition-duration: var\(--duration-fast\)/s,
    );
    expect(styles).toMatch(
      /\.t-dropdown\[data-starting-style\]\s*\{[^}]*scale: var\(--scale-medium\)/s,
    );
    expect(styles).toMatch(
      /\.t-dropdown\[data-ending-style\]\s*\{[^}]*scale: var\(--scale-tiny\);[^}]*transition-duration: var\(--duration-quick\)/s,
    );
    expect(styles).toMatch(
      /\.t-modal\s*\{[^}]*transform-origin: center;[^}]*transition-duration: var\(--duration-fast\)/s,
    );
    expect(styles).toMatch(
      /\.t-modal\[data-ending-style\]\s*\{[^}]*transition-duration: var\(--duration-quick\)/s,
    );
    expect(styles).toMatch(
      /\.t-tooltip\s*\{[^}]*transform-origin: var\(--transform-origin\);[^}]*transition-duration: var\(--duration-quick\)/s,
    );
    expect(styles).toMatch(/\.t-tooltip\[data-ending-style\]\s*\{[^}]*transition-duration: 50ms/s);
    expect(styles).toMatch(
      /\.t-dropdown\[data-instant\],[\s\S]*\.t-tooltip\[data-instant\]\s*\{\s*transition: none;/,
    );
    expect(styles).toContain("--duration-medium: 350ms");
    expect(styles).toContain("--toggle-duration: var(--duration-medium)");
    expect(styles).toContain("--toggle-overshoot: 1px");
    expect(styles).toContain("--toggle-travel: calc(100% - 2px)");
    expect(styles).toContain("animation: arc-toggle-on var(--toggle-duration)");
    expect(styles).toContain("animation: arc-toggle-off var(--toggle-duration)");
    expect(styles).toContain("calc(var(--toggle-travel) + var(--toggle-overshoot))");
    expect(styles).toContain("calc(0px - var(--toggle-overshoot))");
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.t-dropdown,[\s\S]*\.t-tooltip\s*\{\s*transition: none !important;/,
    );
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.t-toggle-thumb\s*\{\s*animation: none !important;/,
    );
  });

  it("wires shared overlays to the renderer motion vocabulary", () => {
    for (const path of ["dropdown-menu.tsx", "combobox.tsx", "popover.tsx", "select.tsx"]) {
      expect(readRendererSource(`components/ui/${path}`)).toContain("t-dropdown");
    }

    const dialog = readRendererSource("components/ui/dialog.tsx");
    expect(dialog).toContain("t-modal-overlay");
    expect(dialog).toContain("t-modal fixed");

    const tooltip = readRendererSource("components/ui/tooltip.tsx");
    expect(tooltip).toContain("delay = 80");
    expect(tooltip).toContain("t-tooltip");

    const tabs = readRendererSource("components/ui/tabs.tsx");
    expect(tabs).toContain("duration-[var(--duration-fast)]");
    expect(tabs).toContain("ease-[var(--ease-smooth-out)]");

    expect(readRendererSource("components/ui/select.tsx")).toContain(
      "data-[align-trigger=true]:transition-none",
    );
    expect(readRendererSource("components/reui/cascader/cascader.tsx")).toContain("t-dropdown");
    expect(readRendererSource("components/reui/cascader/cascader-footer.tsx")).toContain(
      "t-dropdown",
    );
  });

  it("disables layout and transform motion at each desktop shell boundary", () => {
    const sidebar = readRendererSource("components/ui/sidebar.tsx");
    expect(sidebar.match(/motion-reduce:transition-none/g)).toHaveLength(5);
    expect(sidebar).not.toContain("transition-all");

    const chrome = readRendererSource("components/layout/desktop-chrome-bar.tsx");
    expect(chrome.match(/motion-reduce:transition-none/g)).toHaveLength(2);
    expect(chrome).toContain("transition-[left,transform]");
    expect(chrome).toContain("transition-[left]");

    const inbox = readRendererSource("components/features/meeting/meeting-inbox-menu.tsx");
    expect(inbox).toContain("duration-[var(--duration-fast)]");
    expect(inbox).toContain("ease-[var(--ease-smooth-out)]");
    expect(inbox).toContain("motion-reduce:translate-x-0");
    expect(inbox).toContain("motion-reduce:transition-none");

    const switchSource = readRendererSource("components/ui/switch.tsx");
    expect(switchSource).toContain('"t-toggle peer group/switch');
    expect(switchSource).toContain("t-toggle-thumb");
    expect(switchSource).toContain('dataset.motionReady = ""');
    expect(switchSource).not.toContain("transition-transform");
  });

  it("uses disclosure motion tokens without animating reduced-motion layouts", () => {
    const collapsible = readRendererSource("components/ui/collapsible.tsx");
    expect(collapsible).toContain("duration-[var(--duration-fast)]");
    expect(collapsible).toContain("ease-[var(--ease-smooth-out)]");
    expect(collapsible).toContain(
      "[--radix-collapsible-content-height:var(--collapsible-panel-height)]",
    );
    expect(collapsible).toContain("data-starting-style:animate-collapsible-down");
    expect(collapsible).toContain("data-ending-style:animate-collapsible-up");
    expect(collapsible).toContain("motion-reduce:animate-none");

    const cascaderItem = readRendererSource("components/reui/cascader/cascader-item.tsx");
    expect(cascaderItem).toContain(
      "transition-transform duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] motion-reduce:transition-none",
    );

    const chevrons = readRendererSource("components/icons/chevrons-up-down-icon.tsx");
    expect(chevrons).toContain("[transform-box:fill-box]");
    expect(chevrons).toContain("in-data-[panel-open]:-scale-y-100");
    expect(chevrons).toContain("duration-[var(--duration-fast)]");
    expect(chevrons).toContain("ease-[var(--ease-smooth-out)]");
    expect(chevrons).toContain("motion-reduce:transition-none");
    expect(chevrons).not.toContain("motion/react");

    const workExperience = readRendererSource("components/features/resume/work-experience.tsx");
    expect(workExperience).toContain("<ChevronsUpDownIcon />");
    expect(workExperience).not.toContain("ChevronsUpDownIconHandle");
    expect(workExperience).not.toContain("onOpenChange");
  });

  it("keeps desktop button feedback aligned with the web motion tokens", () => {
    const button = readRendererSource("components/ui/button.tsx");
    expect(button).toContain("duration-[var(--duration-quick)]");
    expect(button).toContain("ease-[var(--ease-smooth-out)]");
    expect(button).toContain("motion-reduce:active:scale-100");
  });
});
