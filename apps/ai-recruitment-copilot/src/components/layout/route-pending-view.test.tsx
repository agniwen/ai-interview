import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoutePendingContent } from "./route-pending-view";

describe("RoutePendingView", () => {
  it("keeps the homepage artwork mounted while the root route resolves", () => {
    const markup = renderToStaticMarkup(<RoutePendingContent pathname="/" />);

    expect(markup).toContain('data-slot="home-route-pending"');
    expect(markup).toContain("mixed-media-k-talent-city-4k-light.jpg");
    expect(markup).toContain("mixed-media-k-talent-city-4k-dark.jpg");
    expect(markup).not.toContain("正在加载");
  });

  it("keeps the standard pending feedback on application routes", () => {
    const markup = renderToStaticMarkup(<RoutePendingContent pathname="/w/acme/studio" />);

    expect(markup).not.toContain('data-slot="home-route-pending"');
    expect(markup).toContain("正在加载");
  });
});
