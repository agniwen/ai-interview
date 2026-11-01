// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { personSilhouetteHairstyle, personSilhouetteHue } from "./person-silhouette";

// SAFETY: Vitest's jsdom global supports React's documented act-environment marker.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Base UI preloads avatar images with `new window.Image()`; this stand-in lets a test decide
// when the image finishes loading.
class ControlledImage {
  static latest: ControlledImage | null = null;
  complete = false;
  crossOrigin: string | null = null;
  naturalWidth = 0;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  src = "";

  constructor() {
    ControlledImage.latest = this;
  }
}

describe("Avatar", () => {
  it("renders a deterministic generated portrait when a seed is provided", () => {
    const first = renderToStaticMarkup(
      <Avatar label="李晗的头像" seed="candidate:李晗">
        <AvatarFallback>李</AvatarFallback>
      </Avatar>,
    );
    const second = renderToStaticMarkup(
      <Avatar label="李晗的头像" seed="candidate:李晗">
        <AvatarFallback>李</AvatarFallback>
      </Avatar>,
    );

    expect(first).toBe(second);
    expect(first).toContain('data-generated-avatar=""');
    expect(first).toContain('aria-label="李晗的头像"');
    expect(first).toContain("data-hairstyle=");
    expect(first).not.toContain(">李<");
  });

  it("tints each portrait with a single hue picked from the seed", () => {
    const names = ["李晗", "陈绮浈", "王一帆", "张晓明", "刘思远", "周雨桐", "赵子涵", "孙浩然"];
    const html = renderToStaticMarkup(<Avatar label="头像" seed="candidate:李晗" />);

    expect(html).toContain(`oklch(0.66 0.12 ${personSilhouetteHue("candidate:李晗")})`);
    expect(
      new Set(names.map((name) => personSilhouetteHue(`candidate:${name}`))).size,
    ).toBeGreaterThan(1);
  });

  it("picks the portrait hairstyle from the seed", () => {
    const render = (seed: string) => renderToStaticMarkup(<Avatar label="头像" seed={seed} />);

    const html = render("candidate:李晗");
    expect(html).toContain(`data-hairstyle="${personSilhouetteHairstyle("candidate:李晗")}"`);

    const hairstyles = new Set(
      ["李晗", "陈绮浈", "王一帆", "张晓明", "刘思远", "周雨桐", "赵子涵", "孙浩然"].map((name) =>
        personSilhouetteHairstyle(`candidate:${name}`),
      ),
    );
    expect(hairstyles.size).toBeGreaterThan(1);
  });

  it("keeps the existing fallback path when no seed is provided", () => {
    const html = renderToStaticMarkup(
      <Avatar>
        <AvatarFallback>李</AvatarFallback>
      </Avatar>,
    );

    expect(html).not.toContain("data-generated-avatar");
    expect(html).toContain(">李<");
  });

  it("keeps a user's own avatar content above the generated fallback", () => {
    const html = renderToStaticMarkup(
      <Avatar label="荷叶的头像" seed="user:荷叶">
        <span data-own-avatar="">真实头像</span>
        <AvatarFallback>荷</AvatarFallback>
      </Avatar>,
    );

    expect(html).toContain('data-own-avatar=""');
    expect(html).toContain("真实头像");
    expect(html).toContain('data-generated-avatar=""');
    expect(html).not.toContain('data-slot="avatar-fallback"');
  });
});

describe("Avatar with a candidate photo", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    ControlledImage.latest = null;
    vi.stubGlobal("Image", ControlledImage);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <Avatar label="陈绮浈的头像" seed="candidate:陈绮浈">
          <AvatarImage alt="" src="/avatar.jpg" />
          <AvatarFallback>陈</AvatarFallback>
        </Avatar>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function settleImage(outcome: "error" | "load") {
    const image = ControlledImage.latest;
    if (!image) {
      throw new Error("Avatar image was not preloaded.");
    }
    act(() => {
      if (outcome === "load") {
        image.naturalWidth = 120;
        image.onload?.();
      } else {
        image.onerror?.();
      }
    });
  }

  it("shows the skeleton placeholder instead of the generated portrait while the photo loads", () => {
    expect(container.querySelector("[data-hairstyle]")).toBeNull();
    expect(container.querySelector("[data-avatar-loading]")).not.toBeNull();
  });

  it("shows only the photo once it loads", () => {
    settleImage("load");

    expect(container.querySelector("img")?.getAttribute("src")).toBe("/avatar.jpg");
    expect(container.querySelector("[data-hairstyle]")).toBeNull();
    expect(container.querySelector("[data-avatar-loading]")).toBeNull();
  });

  it("falls back to the generated avatar when the photo fails", () => {
    settleImage("error");

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-hairstyle]")).not.toBeNull();
  });
});
