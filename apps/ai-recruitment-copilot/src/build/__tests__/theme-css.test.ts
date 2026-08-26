import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { build } from "vite";
import { describe, expect, it } from "vitest";

describe("theme transition production CSS", () => {
  it("preserves the SVG mask through Tailwind, Vite URL rewriting and minification", async () => {
    // The unencoded SVG filter URL used to be rewritten inside the data URL,
    // leaving quotes that made Lightning CSS reject the production stylesheet.
    await expect(
      build({
        build: {
          cssMinify: "lightningcss",
          rolldownOptions: { input: "src/styles/globals.css" },
          write: false,
        },
        configFile: false,
        logLevel: "silent",
        plugins: [tailwindcss()],
        root: fileURLToPath(new URL("../../../", import.meta.url)),
      }),
    ).resolves.toMatchObject({
      output: expect.arrayContaining([
        expect.objectContaining({
          source: expect.stringContaining("theme-triangle-blur"),
          type: "asset",
        }),
      ]),
    });
  });
});
