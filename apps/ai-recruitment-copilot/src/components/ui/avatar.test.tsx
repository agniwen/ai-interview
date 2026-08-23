// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Avatar, AvatarFallback } from "./avatar";

describe("Avatar", () => {
  it("renders a deterministic Outpace gradient when a seed is provided", () => {
    const first = renderToStaticMarkup(
      <Avatar label="李晗的头像" seed="candidate:李晗">
        <AvatarFallback>李</AvatarFallback>
      </Avatar>,
    );
    const second = renderToStaticMarkup(
      <Avatar label="李晗的头像" seed="candidate:李晗">
        <AvatarFallback>李</AvatarFallback>
      </Avatar>,
    );

    expect(first).toBe(second);
    expect(first).toContain('data-generated-avatar=""');
    expect(first).toContain('aria-label="李晗的头像"');
    expect(first).toContain("<canvas");
    expect(first).not.toContain(">李<");
  });

  it("keeps the existing fallback path when no seed is provided", () => {
    const html = renderToStaticMarkup(
      <Avatar>
        <AvatarFallback>李</AvatarFallback>
      </Avatar>,
    );

    expect(html).not.toContain("data-generated-avatar");
    expect(html).toContain(">李<");
  });

  it("keeps a user's own avatar content above the generated fallback", () => {
    const html = renderToStaticMarkup(
      <Avatar label="荷叶的头像" seed="user:荷叶">
        <span data-own-avatar="">真实头像</span>
        <AvatarFallback>荷</AvatarFallback>
      </Avatar>,
    );

    expect(html).toContain('data-own-avatar=""');
    expect(html).toContain("真实头像");
    expect(html).toContain('data-generated-avatar=""');
    expect(html).not.toContain('data-slot="avatar-fallback"');
  });
});
