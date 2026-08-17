import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf-8");
}

describe("sidebar inset header appearance", () => {
  it("places a two-header-high gradient below the transparent header", () => {
    const headerSource = readSource("sidebar-inset-header.tsx");

    expect(headerSource).toContain("bg-transparent");
    expect(headerSource).toContain("after:top-0");
    expect(headerSource).toContain("after:h-[calc(var(--header-height)*2)]");
    expect(headerSource).toContain("after:bg-linear-to-b");
    expect(headerSource).toContain("after:from-background");
    expect(headerSource).toContain("after:from-20%");
    expect(headerSource).toContain("after:to-transparent");
    expect(headerSource).toContain("after:pointer-events-none");
    expect(headerSource.match(/relative z-1/g)).toHaveLength(2);
    expect(headerSource).not.toContain("backdrop-blur");
    expect(headerSource).not.toContain("border-b");
  });

  it("does not override the shared appearance in the agent header", () => {
    const chatHeaderSource = readSource("../../features/chat/chat-header.tsx");

    expect(chatHeaderSource).not.toContain("backdrop-blur");
    expect(chatHeaderSource).not.toContain('className="bg-background');
  });
});
