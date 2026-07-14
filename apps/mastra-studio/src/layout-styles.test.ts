import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Studio layout styles", () => {
  it("generates responsive utilities used by the local Studio source", () => {
    const source = readFileSync(resolve(__dirname, "index.css"), "utf-8");

    expect(source).toContain('@import "tailwindcss";');
  });
});
