import { describe, expect, it } from "vitest";
import { isolateMastraPlaygroundCss, isMastraPlaygroundStylesheet } from "./isolate-playground-css";

describe("isolateMastraPlaygroundCss", () => {
  it("moves document theme selectors onto the embedded Studio boundary", () => {
    const source = `
@layer theme {
  :root, :host { --font-sans: sans-serif; }
  html, :host { line-height: 1.5; }
  body { margin: 0; }
}
@layer base {
  *, :before, :after { box-sizing: border-box; }
  button, input { font: inherit; }
}
:root { --surface1: black; }
html.light { --surface1: white; }
.flex { display: flex; }
`;

    const result = isolateMastraPlaygroundCss(source);

    expect(result).not.toContain(":root");
    expect(result).not.toContain("html.light");
    expect(result).toContain(":scope.light");
    expect(
      result.startsWith(
        "@scope (:is(.mastra-studio-theme, body.mastra-studio-active [data-base-ui-portal])) {\n",
      ),
    ).toBe(true);
    expect(result.endsWith("\n}")).toBe(true);
    expect(result).toContain("@layer mastra-studio-base {");
    expect(result).toContain("@layer mastra-studio-theme {");
    expect(result).toContain(".flex { display: flex; }");
    expect(result).not.toContain("@layer utilities");
  });

  it("matches only the published playground stylesheet", () => {
    expect(
      isMastraPlaygroundStylesheet(
        "/repo/node_modules/@mastra/playground-ui/dist/style.css?direct",
      ),
    ).toBe(true);
    expect(isMastraPlaygroundStylesheet("/repo/src/styles/globals.css")).toBe(false);
  });
});
