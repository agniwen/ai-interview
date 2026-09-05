import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { build } from "vite";
import { describe, expect, it } from "vitest";

describe("production theme CSS", () => {
  it("preserves the theme mask and primary sidebar focus rings after compilation", async () => {
    // The unencoded SVG filter URL used to be rewritten inside the data URL,
    // leaving quotes that made Lightning CSS reject the production stylesheet.
    const result = await build({
      build: {
        cssMinify: "lightningcss",
        rolldownOptions: { input: "src/styles/globals.css" },
        write: false,
      },
      configFile: false,
      logLevel: "silent",
      plugins: [tailwindcss()],
      root: fileURLToPath(new URL("../../../", import.meta.url)),
    });

    expect(result).toMatchObject({
      output: expect.arrayContaining([
        expect.objectContaining({
          source: expect.stringContaining("theme-triangle-blur"),
          type: "asset",
        }),
      ]),
    });

    if (!("output" in result)) {
      throw new Error("Expected a completed CSS build");
    }

    const css = result.output
      .find(
        (output): output is Extract<(typeof result.output)[number], { type: "asset" }> =>
          output.type === "asset" && output.fileName.endsWith(".css"),
      )
      ?.source.toString();

    expect(css?.match(/--sidebar-ring:var\(--primary\)/g)).toHaveLength(2);
  });
});
