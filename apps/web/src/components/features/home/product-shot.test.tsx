import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductShot } from "./product-shot";

describe("ProductShot", () => {
  it("reveals the homepage mock frame upward as soon as the page mounts", () => {
    const markup = renderToStaticMarkup(<ProductShot />);
    const globalStyles = readFileSync(
      new URL("../../../styles/globals.css", import.meta.url),
      "utf-8",
    );

    expect(markup).toContain("招聘");
    expect(markup).toMatch(
      /class="home-product-shot-enter" style="opacity:0;transform:translateY\(16px\)"/,
    );
    expect(globalStyles).not.toContain("home-product-shot-before-enter");
    expect(globalStyles).not.toContain("@keyframes home-product-shot-enter");
    expect(globalStyles).toContain("animation-timeline: view()");
    expect(globalStyles).toContain("@keyframes home-product-shot-scroll-scale");
    expect(globalStyles).not.toContain("@starting-style");
  });
});
