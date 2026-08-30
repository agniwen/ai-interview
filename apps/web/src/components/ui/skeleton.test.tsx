import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("keeps the default surface unchanged", () => {
    const html = renderToStaticMarkup(<Skeleton />);

    expect(html).toContain("bg-accent");
    expect(html).not.toContain("bg-muted/50");
  });

  it("supports a quieter loading surface", () => {
    const html = renderToStaticMarkup(<Skeleton variant="subtle" />);

    expect(html).toContain("bg-muted/50");
    expect(html).not.toContain("bg-accent");
  });
});
