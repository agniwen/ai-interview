import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../recruiting-thread.tsx", import.meta.url), "utf-8");

describe("recruiting thread composer", () => {
  it("starts at one line and grows with the message content", () => {
    const composerInput = source.slice(
      source.indexOf("function RecruitingComposerInput"),
      source.indexOf("function Composer"),
    );

    expect(composerInput).toContain("max-h-36");
    expect(composerInput).toContain("min-w-0 flex-1");
    expect(composerInput).toContain("[&_.aui-lexical-input]:min-h-9");
    expect(composerInput).toContain("[&_.aui-lexical-input]:py-1.5");
    expect(composerInput).toContain("[&_.aui-lexical-input]:ps-1");
    expect(composerInput).toContain("[&_.aui-lexical-input]:pe-14");
    expect(composerInput).toContain("[&_.aui-lexical-placeholder]:start-1");
    expect(composerInput).toContain("[&_.aui-lexical-placeholder]:end-14");
    expect(composerInput).toContain("[&_.aui-lexical-placeholder]:top-1.5");
    expect(composerInput).not.toContain("bg-transparent px-2 text-base");
    expect(composerInput).not.toContain("min-h-10 w-full");
  });

  it("keeps the action inline and matches the new-thread shadow states", () => {
    const composer = source.slice(
      source.indexOf("function Composer"),
      source.indexOf("function CopilotToolContextReporter"),
    );

    expect(composer).toContain("flex w-full items-end gap-2");
    expect(composer).toContain("shadow-md transition-shadow focus-within:shadow-xl");
    expect(composer).toContain("data-[multiline]:pb-13");
    expect(composer).toContain("data-[multiline]:[&_.aui-lexical-input]:pe-1");
    expect(composer).toContain("ref={composerShellRef}");
    expect(composer).toContain("onClick={focusComposerInputFromShellClick}");
    expect(composer).toContain(
      "aui-composer-action-wrapper absolute right-3 bottom-2 z-1 flex shrink-0",
    );
    expect(composer).not.toContain("focus-within:border-foreground/20");
    expect(composer).not.toContain("aui-composer-shell relative flex w-full flex-col");
  });

  it("keeps the top-anchored user turn below the full header fade", () => {
    const userMessage = source.slice(
      source.indexOf("function UserMessage"),
      source.indexOf("function ThreadMessage"),
    );

    expect(userMessage).toContain(
      "[&[data-aui-top-anchor-user]]:translate-y-[calc(var(--header-height)*2)]",
    );
    expect(userMessage).toContain(
      "[&[data-aui-top-anchor-user]]:mb-[calc(var(--header-height)*2)]",
    );
  });

  it("anchors the scroll-to-bottom control just above the growing composer", () => {
    expect(source).toContain('className="relative mx-auto w-full max-w-(--thread-max-width)"');
    expect(source).toContain("aui-thread-scroll-to-bottom absolute -top-10 left-1/2 z-20 size-8");
    expect(source).not.toContain("aui-thread-scroll-to-bottom absolute bottom-40");
  });
});
