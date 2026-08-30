import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../new-recruiting-thread.tsx", import.meta.url), "utf-8");
const styleSource = readFileSync(
  new URL("../recruiting-composer-style.ts", import.meta.url),
  "utf-8",
);
const focusSource = readFileSync(
  new URL("../recruiting-composer-focus.ts", import.meta.url),
  "utf-8",
);
const layoutSource = readFileSync(
  new URL("../use-recruiting-composer-shell-layout.ts", import.meta.url),
  "utf-8",
);
const globalStyles = readFileSync(new URL("../../../styles/globals.css", import.meta.url), "utf-8");

describe("new recruiting thread composer", () => {
  it("shows a large brand-colored blobatar above the welcome title and follows the pointer", () => {
    expect(source).toContain('import { Blobatar } from "@blobatar/react"');
    expect(source).toContain('import { useGaze } from "@blobatar/react/gaze"');
    expect(source).toContain('import "blobatar/gaze.css"');
    expect(source).toContain('import "blobatar/motion.css"');
    expect(source).toContain('eye: "#ffffff"');
    expect(source).toContain('head: "#97D781"');
    expect(source).toContain('"body.ratio": 0.5');
    expect(source).toContain('"eye.rx": 0.9');
    expect(source).toContain('"eye.scale": 0.5');
    expect(source).toContain("shape: 0.11");
    expect(source).toContain('useGaze({ lookAt: "pointer", travel: 3 })');
    expect(source).toContain('animate="always"');
    expect(source).toContain("background={false}");
    expect(source).toContain("text-[#97D781]");
    expect(source).toContain("dark:text-[#008FFF]");
    expect(source).toContain("[--welcome-blobatar-eye:#ffffff]");
    expect(source).toContain("dark:[--welcome-blobatar-eye:var(--background)]");
    expect(source).toContain("size={120}");
    expect(source).toContain('"--mo-eye": "var(--welcome-blobatar-eye)"');
    expect(source).toContain('"--mo-head": "currentColor"');
    expect(source).toContain("style={WELCOME_BLOBATAR_STYLE}");
    expect(source).toContain("traits={WELCOME_BLOBATAR_TRAITS}");
    expect(source.indexOf("<RecruitingWelcomeBlobatar />")).toBeLessThan(
      source.indexOf("从哪里开始招聘协作？"),
    );
  });

  it("keeps a soft downward shadow and strengthens it on focus", () => {
    expect(source).toContain("shadow-md");
    expect(source).toContain("transition-shadow");
    expect(source).toContain("focus-within:shadow-xl");
    expect(source).not.toContain("focus-within:border-foreground/20");
  });

  it("balances the one-line input around the send button", () => {
    expect(source).toContain("[&_.aui-lexical-input]:py-1.5");
    expect(source).toContain("[&_.aui-lexical-input]:ps-1");
    expect(source).toContain("[&_.aui-lexical-input]:pe-14");
    expect(source).toContain("[&_.aui-lexical-placeholder]:start-1");
    expect(source).toContain("[&_.aui-lexical-placeholder]:end-14");
    expect(source).toContain("[&_.aui-lexical-placeholder]:top-1.5");
    expect(source).not.toContain("bg-transparent px-2 text-base");
  });

  it("uses the light theme color and preserves the dark palette", () => {
    expect(styleSource).toContain("border-primary-border");
    expect(styleSource).toContain("bg-primary");
    expect(styleSource).toContain("text-primary-foreground");
    expect(styleSource).toContain("hover:bg-primary/90");
    expect(styleSource).toContain("dark:border-ring");
    expect(styleSource).toContain("dark:bg-primary");
    expect(styleSource).toContain("dark:text-primary-foreground");
    expect(styleSource).toContain("dark:hover:bg-primary/90");
    expect(styleSource).toContain("dark:disabled:bg-muted");
    expect(styleSource).toContain("dark:disabled:border-input");
    expect(styleSource).toContain("dark:disabled:text-muted-foreground");
  });

  it("uses a scoped, theme-aware scrollbar for the composer", () => {
    expect(globalStyles).toContain(".aui-composer-input::-webkit-scrollbar");
    expect(globalStyles).toContain("width: 6px");
    expect(globalStyles).toContain(
      "scrollbar-color: color-mix(in oklab, var(--muted-foreground) 18%, transparent) transparent",
    );
    expect(globalStyles).toContain(".aui-composer-input::-webkit-scrollbar-thumb:hover");
    expect(globalStyles).toContain(".aui-composer-input::-webkit-scrollbar-thumb:active");
  });

  it("focuses the input from non-interactive shell clicks", () => {
    expect(source).toContain("onClick={focusComposerInputFromShellClick}");
    expect(focusSource).toContain('target.closest(".aui-composer-shell")');
    expect(focusSource).toContain("button, [role='button'], .aui-lexical-input");
    expect(focusSource).toContain(
      'shell.querySelector<HTMLElement>(".aui-lexical-input")?.focus()',
    );
  });

  it("pins the send button while extending the scroll layer to the shell edge", () => {
    expect(source).toContain("relative -me-3 max-h-36");
    expect(source).toContain("absolute right-3 bottom-2 z-1 shrink-0");
  });

  it("moves multiline input above a fixed action area", () => {
    expect(source).toContain("ref={composerShellRef}");
    expect(source).toContain("data-[multiline]:pb-13");
    expect(source).toContain("data-[multiline]:[&_.aui-lexical-input]:pe-1");
    expect(layoutSource).toContain("input.cloneNode(true)");
    expect(layoutSource).toContain("measurement.style.paddingInlineEnd = singleLinePaddingEnd");
    expect(layoutSource).toContain("new ResizeObserver(scheduleLayoutSync)");
    expect(layoutSource).toContain("new MutationObserver(scheduleLayoutSync)");
    expect(layoutSource).toContain(
      'shell.toggleAttribute("data-multiline", measureMultilineInput(shell, input))',
    );
  });
});
