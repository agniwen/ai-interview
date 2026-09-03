import { describe, expect, it } from "vitest";
import { syncThemeFavicon } from "./theme-provider";

function createFaviconDocument() {
  const light = { media: "(prefers-color-scheme: light)" };
  const dark = { media: "(prefers-color-scheme: dark)" };
  const links = new Map([
    ["#favicon-light", light],
    ["#favicon-dark", dark],
  ]);

  return {
    dark,
    document: {
      querySelector: (selector: string) => links.get(selector) ?? null,
    },
    light,
  };
}

describe("syncThemeFavicon", () => {
  it("activates the light favicon for the light theme", () => {
    const favicon = createFaviconDocument();

    syncThemeFavicon("light", favicon.document);

    expect(favicon.light.media).toBe("all");
    expect(favicon.dark.media).toBe("not all");
  });

  it("activates the dark favicon for the dark theme", () => {
    const favicon = createFaviconDocument();

    syncThemeFavicon("dark", favicon.document);

    expect(favicon.light.media).toBe("not all");
    expect(favicon.dark.media).toBe("all");
  });
});
