import type { VirtualItem, Virtualizer as ReactVirtualizer } from "@tanstack/react-virtual";
import { useElementScrollRestoration } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";

/** Matches AppSidebarShell main content ScrollArea `scrollRestorationId`. */
export const DESKTOP_MAIN_SCROLL_RESTORATION_ID = "desktop-main";

export interface ResumeLibraryScrollRestoreSnapshot {
  measurements: VirtualItem[];
  recordId: string;
  recordTopInScrollElement: number;
  scrollOffset: number;
  viewportWidth: number;
}

interface ResumeLibraryScrollRestoreRef {
  current: ResumeLibraryScrollRestoreSnapshot | null;
}

export const resumeLibraryScrollRestoreSnapshot: ResumeLibraryScrollRestoreRef = { current: null };

export function setResumeLibraryScrollRestoreSnapshot(
  snapshot: ResumeLibraryScrollRestoreSnapshot | null,
) {
  resumeLibraryScrollRestoreSnapshot.current = snapshot;
}

export function findDesktopMainScrollElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-scroll-restoration-id="${DESKTOP_MAIN_SCROLL_RESTORATION_ID}"]`,
  );
}

export function useResumeLibraryInitialScrollRestore(
  restoreSnapshot: ResumeLibraryScrollRestoreSnapshot | null,
) {
  const initialScrollElement = globalThis.document ? findDesktopMainScrollElement() : null;
  const canUseInitialMeasurements =
    Boolean(restoreSnapshot) &&
    Boolean(initialScrollElement) &&
    restoreSnapshot?.viewportWidth === initialScrollElement?.clientWidth;
  const desktopScrollEntry = useElementScrollRestoration({
    id: DESKTOP_MAIN_SCROLL_RESTORATION_ID,
  });

  return {
    initialMeasurementsCache: canUseInitialMeasurements ? restoreSnapshot?.measurements : undefined,
    initialOffset: canUseInitialMeasurements
      ? restoreSnapshot?.scrollOffset
      : desktopScrollEntry?.scrollY,
  };
}

/** Only re-align when viewport width changed since the snapshot was taken. */
export function useResumeLibraryResizeScrollRestore({
  listRootRef,
  records,
  restoreSnapshotRef,
  scrollElement,
  virtualizer,
}: {
  listRootRef: RefObject<HTMLDivElement | null>;
  records: ResumeLibraryListRecord[];
  restoreSnapshotRef: RefObject<ResumeLibraryScrollRestoreSnapshot | null>;
  scrollElement: HTMLElement | null;
  virtualizer: ReactVirtualizer<HTMLElement, HTMLElement>;
}) {
  useEffect(() => {
    const snapshot = restoreSnapshotRef.current;
    if (!snapshot || !scrollElement || records.length === 0) {
      return;
    }
    const recordIndex = records.findIndex((record) => record.id === snapshot.recordId);
    if (recordIndex === -1) {
      resumeLibraryScrollRestoreSnapshot.current = null;
      restoreSnapshotRef.current = null;
      return;
    }
    if (scrollElement.clientWidth === snapshot.viewportWidth) {
      resumeLibraryScrollRestoreSnapshot.current = null;
      restoreSnapshotRef.current = null;
      return;
    }

    let cancelled = false;
    let frame: number | null = null;
    let remainingAttempts = 4;
    const clearSnapshot = () => {
      resumeLibraryScrollRestoreSnapshot.current = null;
      restoreSnapshotRef.current = null;
    };
    const alignToSnapshot = () => {
      if (cancelled) {
        return;
      }
      const rowElement = listRootRef.current?.querySelector<HTMLElement>(
        `[data-resume-record-id="${snapshot.recordId}"]`,
      );
      if (!rowElement && remainingAttempts > 0) {
        remainingAttempts -= 1;
        frame = window.requestAnimationFrame(alignToSnapshot);
        return;
      }
      if (rowElement) {
        const nextTop =
          rowElement.getBoundingClientRect().top - scrollElement.getBoundingClientRect().top;
        const correction = nextTop - snapshot.recordTopInScrollElement;
        if (Math.abs(correction) > 1) {
          virtualizer.scrollToOffset(scrollElement.scrollTop + correction);
        }
      }
      clearSnapshot();
    };
    virtualizer.scrollToIndex(recordIndex, { align: "start" });
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(alignToSnapshot);
    });

    return () => {
      cancelled = true;
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [listRootRef, records, restoreSnapshotRef, scrollElement, virtualizer]);
}

function findVerticalScrollParent(node: HTMLElement | null): HTMLElement | null {
  let parent = node?.parentElement ?? null;
  while (parent && parent !== document.body) {
    const style = getComputedStyle(parent);
    if (
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent;
    }
    if (parent.classList.contains("os-viewport")) {
      return parent;
    }
    parent = parent.parentElement;
  }
  const { scrollingElement } = document;
  if (scrollingElement === document.documentElement) {
    return document.documentElement;
  }
  return scrollingElement === document.body ? document.body : null;
}

export function useResumeLibraryScrollElement(listRootRef: RefObject<HTMLDivElement | null>) {
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let observer: MutationObserver | null = null;
    const selectDesktopViewport = () => {
      const viewport = findDesktopMainScrollElement();
      if (!viewport) {
        return false;
      }
      setScrollElement(viewport);
      observer?.disconnect();
      return true;
    };

    observer = new MutationObserver(selectDesktopViewport);
    observer.observe(document.body, {
      attributeFilter: ["data-scroll-restoration-id"],
      attributes: true,
      subtree: true,
    });

    const frame = window.requestAnimationFrame(() => {
      if (!selectDesktopViewport()) {
        setScrollElement(findVerticalScrollParent(listRootRef.current));
      }
    });
    return () => {
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [listRootRef]);

  return scrollElement;
}
