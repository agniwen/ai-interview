// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  getStudioCandidateDetailScrollToTopElement,
  STUDIO_MAIN_SCROLL_RESTORATION_ID,
} from "./studio-scroll-restoration";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("getStudioCandidateDetailScrollToTopElement", () => {
  it.each(["resumes", "resume-pool"])(
    "does not expose the mounted %s list viewport when returning from details",
    (listPath) => {
      const viewport = document.createElement("div");
      viewport.dataset.scrollRestorationId = STUDIO_MAIN_SCROLL_RESTORATION_ID;
      document.body.append(viewport);

      window.history.replaceState({}, "", `/w/acme/studio/${listPath}`);

      expect(getStudioCandidateDetailScrollToTopElement()).toBeUndefined();
    },
  );

  it.each(["resumes", "resume-pool"])(
    "returns the shared Studio viewport for a standalone %s detail page",
    (listPath) => {
      const viewport = document.createElement("div");
      viewport.dataset.scrollRestorationId = STUDIO_MAIN_SCROLL_RESTORATION_ID;
      document.body.append(viewport);

      window.history.replaceState({}, "", `/w/acme/studio/${listPath}/candidate-1`);

      expect(getStudioCandidateDetailScrollToTopElement()).toBe(viewport);
    },
  );

  it("does not expose the viewport on unrelated Studio pages", () => {
    const viewport = document.createElement("div");
    viewport.dataset.scrollRestorationId = STUDIO_MAIN_SCROLL_RESTORATION_ID;
    document.body.append(viewport);

    window.history.replaceState({}, "", "/w/acme/studio/dashboard");

    expect(getStudioCandidateDetailScrollToTopElement()).toBeUndefined();
  });
});
