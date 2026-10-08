import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HiringShaderBackground } from "./hiring-shader-background";

describe("HiringShaderBackground", () => {
  it("keeps the GPU component out of server rendering", () => {
    expect(renderToStaticMarkup(<HiringShaderBackground />)).toBe("");
  });
});
