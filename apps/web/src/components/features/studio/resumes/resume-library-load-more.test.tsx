// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enableReactActEnvironment, renderInAct, unmountInAct } from "@/test-utils/react-act";
import { ResumeLibraryLoadMore } from "./resume-library-load-more";

enableReactActEnvironment();

const roots: Awaited<ReturnType<typeof renderInAct>>["root"][] = [];

afterEach(async () => {
  for (const root of roots) {
    await unmountInAct(root);
  }
  roots.length = 0;
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("ResumeLibraryLoadMore", () => {
  it("requests only one page while the marker remains continuously visible", async () => {
    class AlwaysVisibleIntersectionObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly scrollMargin = "0px";
      readonly thresholds = [0];
      private readonly callback: IntersectionObserverCallback;

      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- IntersectionObserver requires a synchronous callback constructor.
      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
      }

      disconnect = vi.fn();

      observe = (target: Element) => {
        const bounds = new DOMRectReadOnly();
        const entry: IntersectionObserverEntry = {
          boundingClientRect: bounds,
          intersectionRatio: 1,
          intersectionRect: bounds,
          isIntersecting: true,
          rootBounds: null,
          target,
          time: 0,
        };
        this.callback([entry], this);
      };

      takeRecords = () => {
        void this.callback;
        return [];
      };
      unobserve = vi.fn();
    }

    vi.stubGlobal("IntersectionObserver", AlwaysVisibleIntersectionObserver);
    const fetchNextPage = vi.fn(() => Promise.resolve());
    const firstRender = await renderInAct(
      <ResumeLibraryLoadMore
        fetchNextPage={() => fetchNextPage()}
        hasNextPage
        isFetchingNextPage={false}
        scrollElement={null}
        statusText="已显示 40 / 1642 条"
      />,
    );
    roots.push(firstRender.root);

    expect(fetchNextPage).toHaveBeenCalledOnce();
    const marker = firstRender.container.querySelector<HTMLElement>("div");
    expect(marker?.style.overflowAnchor).toBe("none");

    act(() => {
      firstRender.root.render(
        <ResumeLibraryLoadMore
          fetchNextPage={() => fetchNextPage()}
          hasNextPage
          isFetchingNextPage
          scrollElement={null}
          statusText="正在加载更多简历"
        />,
      );
    });
    act(() => {
      firstRender.root.render(
        <ResumeLibraryLoadMore
          fetchNextPage={() => fetchNextPage()}
          hasNextPage
          isFetchingNextPage={false}
          scrollElement={null}
          statusText="已显示 60 / 1642 条"
        />,
      );
    });

    expect(fetchNextPage).toHaveBeenCalledOnce();
  });
});
