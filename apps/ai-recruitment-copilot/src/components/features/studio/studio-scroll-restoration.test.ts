// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  getStudioMainScrollToTopElement,
  STUDIO_MAIN_SCROLL_RESTORATION_ID,
} from "./studio-scroll-restoration";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("getStudioMainScrollToTopElement", () => {
  it("returns the shared Studio viewport so list-route navigation can reset it", () => {
    const viewport = document.createElement("div");
    viewport.dataset.scrollRestorationId = STUDIO_MAIN_SCROLL_RESTORATION_ID;
    document.body.append(viewport);

    expect(getStudioMainScrollToTopElement()).toBe(viewport);
  });
});
