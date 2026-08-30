import { useEffect, useRef } from "react";

export function ResumeLibraryLoadMore({
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  scrollElement,
  statusText,
}: {
  fetchNextPage: () => Promise<void>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  scrollElement: HTMLElement | null;
  statusText: string;
}) {
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadRequestedWhileVisibleRef = useRef(false);

  useEffect(() => {
    const node = loadMoreRef.current;
    const IntersectionObserverConstructor = globalThis.IntersectionObserver;
    if (!node || !hasNextPage || !IntersectionObserverConstructor) {
      return;
    }
    const observer = new IntersectionObserverConstructor(
      (entries) => {
        const isIntersecting = entries.some((entry) => entry.isIntersecting);
        if (!isIntersecting) {
          loadRequestedWhileVisibleRef.current = false;
          return;
        }
        if (!loadRequestedWhileVisibleRef.current && !isFetchingNextPage) {
          loadRequestedWhileVisibleRef.current = true;
          void fetchNextPage();
        }
      },
      { root: scrollElement, rootMargin: "720px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, scrollElement]);

  return (
    <div
      className="flex min-h-10 items-center justify-center text-muted-foreground text-sm"
      ref={loadMoreRef}
      style={{ overflowAnchor: "none" }}
    >
      {statusText}
    </div>
  );
}
