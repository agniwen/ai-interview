// @vitest-environment jsdom
import { setTimeout as delay } from "node:timers/promises";
import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useInfiniteQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useResumeLibraryLoadMore } from "./use-resume-library-load-more";

// Browsers deliver an initial intersection event whenever a sentinel is observed.
class VisibleSentinelObserver implements IntersectionObserver {
  static remainingNotifications = 12;
  static notificationsPerObservation = 1;
  readonly root = null;
  readonly scrollMargin = "0px";
  readonly rootMargin = "720px 0px";
  readonly thresholds = [0];
  private active = true;
  private readonly onEntries: IntersectionObserverCallback;

  constructor(onEntries: IntersectionObserverCallback) {
    this.onEntries = onEntries;
  }

  observe(target: Element) {
    queueMicrotask(() => {
      // Bound a broken implementation so the regression fails instead of hanging.
      for (let i = 0; i < VisibleSentinelObserver.notificationsPerObservation; i += 1) {
        if (this.active && VisibleSentinelObserver.remainingNotifications > 0) {
          VisibleSentinelObserver.remainingNotifications -= 1;
          const rect = target.getBoundingClientRect();
          this.onEntries(
            [
              {
                boundingClientRect: rect,
                intersectionRatio: 1,
                intersectionRect: rect,
                isIntersecting: true,
                rootBounds: rect,
                target,
                time: performance.now(),
              },
            ],
            this,
          );
        }
      }
    });
  }

  disconnect() {
    this.active = false;
  }
  unobserve() {
    this.active = false;
  }
  // oxlint-disable-next-line class-methods-use-this -- Required IntersectionObserver test double method.
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("IntersectionObserver", VisibleSentinelObserver);
  VisibleSentinelObserver.remainingNotifications = 12;
  VisibleSentinelObserver.notificationsPerObservation = 1;
});
afterEach(() => vi.unstubAllGlobals());

async function renderList(
  queryFn: (page: number) => Promise<{ page: number }>,
  staleTime = Infinity,
) {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  function Harness() {
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const query = useInfiniteQuery({
      getNextPageParam: (lastPage) => (lastPage.page < 2 ? lastPage.page + 1 : undefined),
      initialData: { pageParams: [1], pages: [{ page: 1 }] },
      initialPageParam: 1,
      queryFn: ({ pageParam }) => queryFn(pageParam),
      queryKey: ["load-more-regression"],
      staleTime,
    });
    useResumeLibraryLoadMore({
      error: query.error,
      fetchNextPage: async () => {
        await query.fetchNextPage({ cancelRefetch: false });
      },
      hasNextPage: query.hasNextPage,
      isFetching: query.isFetching,
      loadMoreRef,
      scrollElement: container,
    });
    return (
      <>
        <div ref={loadMoreRef}>
          {query.isFetchingNextPage ? "正在加载更多简历" : `${query.data.pages.length} 页`}
        </div>
        <button
          onClick={() => {
            void query.fetchNextPage({ cancelRefetch: false });
          }}
          type="button"
        >
          重试
        </button>
      </>
    );
  }
  await act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    );
  });
  return {
    container,
    async dispose() {
      await act(() => {
        root.unmount();
      });
      container.remove();
      client.clear();
    },
  };
}

async function flushQueryUpdates() {
  for (let tick = 0; tick < 10; tick += 1) {
    await act(async () => {
      await delay(5);
    });
  }
}

describe("recruitment infinite-scroll requests", () => {
  it("stops after a failed next page while the bottom stays visible and allows manual retry", async () => {
    const nextPage = vi
      .fn<(page: number) => Promise<{ page: number }>>()
      .mockRejectedValue(new Error("分页请求失败"));
    const view = await renderList(nextPage);
    try {
      await flushQueryUpdates();
      expect(nextPage).toHaveBeenCalledTimes(1);
      expect(nextPage).toHaveBeenLastCalledWith(2);
      expect(view.container.textContent).toContain("1 页");
      nextPage.mockResolvedValue({ page: 2 });
      await act(() => {
        view.container.querySelector("button")?.click();
      });
      await flushQueryUpdates();
      expect(nextPage).toHaveBeenCalledTimes(2);
      expect(view.container.textContent).toContain("2 页");
    } finally {
      await view.dispose();
    }
  });

  it("does not restart an in-flight request on repeated intersection events and stops on the last page", async () => {
    VisibleSentinelObserver.notificationsPerObservation = 2;
    const nextPage = vi.fn(async () => {
      await delay(10);
      return { page: 2 };
    });
    const view = await renderList(nextPage);
    try {
      await flushQueryUpdates();
      expect(nextPage).toHaveBeenCalledTimes(1);
      expect(view.container.textContent).toContain("2 页");
    } finally {
      await view.dispose();
    }
  });

  it("waits for the background refresh before requesting the next page", async () => {
    const refresh = Promise.withResolvers<{ page: number }>();
    const queryFn = vi.fn((page: number) =>
      page === 1 ? refresh.promise : Promise.resolve({ page: 2 }),
    );
    const view = await renderList(queryFn, 0);
    try {
      await flushQueryUpdates();
      expect(queryFn.mock.calls).toEqual([[1]]);
      await act(() => {
        refresh.resolve({ page: 1 });
      });
      await flushQueryUpdates();
      expect(queryFn.mock.calls).toEqual([[1], [2]]);
      expect(view.container.textContent).toContain("2 页");
    } finally {
      await view.dispose();
    }
  });
});
