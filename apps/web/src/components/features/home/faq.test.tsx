import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Faq } from "./faq";

describe("Faq", () => {
  it("renders every question expanded initially", () => {
    const markup = renderToStaticMarkup(<Faq />);

    expect(markup.match(/aria-expanded="true"/g)).toHaveLength(5);
    expect(markup).not.toContain('aria-expanded="false"');
    expect(markup).not.toContain(">FAQ<");
    expect(markup).toMatch(/<h2 class="[^"]*text-balance/);
    expect(markup.match(/text-balance/g)).toHaveLength(6);
  });
});
