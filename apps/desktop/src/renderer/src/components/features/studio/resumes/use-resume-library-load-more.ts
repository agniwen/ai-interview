import { useEffect } from "react";
import type { RefObject } from "react";

export function useResumeLibraryLoadMore({
  error,
  loadMoreRef,
  fetchNextPage,
  hasNextPage,
  isFetching,
  scrollElement,
}: {
  error: Error | null;
  loadMoreRef: RefObject<HTMLDivElement | null>;
  fetchNextPage: () => Promise<void>;
  hasNextPage: boolean;
  isFetching: boolean;
  scrollElement: HTMLElement | null;
}) {
  useEffect(() => {
    const node = loadMoreRef.current;
    const IntersectionObserverConstructor = globalThis.IntersectionObserver;
    if (
      !node ||
      !scrollElement ||
      error ||
      isFetching ||
      !hasNextPage ||
      !IntersectionObserverConstructor
    ) {
      return;
    }
    const observer = new IntersectionObserverConstructor(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !isFetching) {
          void fetchNextPage();
        }
      },
      { root: scrollElement, rootMargin: "720px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [error, fetchNextPage, hasNextPage, isFetching, loadMoreRef, scrollElement]);
}
