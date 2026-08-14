import { useEffect, useRef, useState, useCallback } from "react";

type OmType = "observation" | "reflection";

const HIGHLIGHT_BADGE_PADDING = 12;

interface HighlightPosition {
  cycleId: string;
  omType: OmType;
  state:
    | "loading"
    | "complete"
    | "failed"
    | "disconnected"
    | "buffering"
    | "buffering-complete"
    | "buffering-failed"
    | "activated";
  top: number;
  height: number;
}

function findPreviousBadge(
  badges: HTMLElement[],
  currentIndex: number,
  omType: OmType,
): HTMLElement | null {
  for (let j = currentIndex - 1; j >= 0; j -= 1) {
    const badge = badges[j];
    if (badge.dataset.omState === "failed") {
      continue;
    }
    if (omType === "observation" || badge.dataset.omType === "reflection") {
      return badge;
    }
  }
  return null;
}

function getStateColor(state: HighlightPosition["state"]): string {
  const colors: Record<HighlightPosition["state"], string> = {
    activated: "rgba(34, 197, 94, 0.4)",
    buffering: "rgba(156, 163, 175, 0.45)",
    "buffering-complete": "rgba(156, 163, 175, 0.45)",
    "buffering-failed": "rgba(239, 68, 68, 0.4)",
    complete: "rgba(34, 197, 94, 0.4)",
    disconnected: "rgba(234, 179, 8, 0.4)",
    failed: "rgba(239, 68, 68, 0.4)",
    loading: "rgba(59, 130, 246, 0.4)",
  };
  return colors[state];
}

function HighlightBlock({
  highlight,
  visible,
}: {
  highlight: HighlightPosition;
  visible: boolean;
}) {
  const color = getStateColor(highlight.state);
  const isBufferingState = highlight.state.startsWith("buffering");

  return (
    <div
      className="absolute left-0 right-0 transition-opacity duration-200"
      style={{
        border: `2px ${isBufferingState ? "dashed" : "solid"} ${color}`,
        borderRadius: "0.5rem",
        height: highlight.height,
        opacity: visible ? 1 : 0,
        top: highlight.top,
      }}
    />
  );
}

/**
 * Renders absolutely-positioned background highlights behind messages that have
 * been observed by Observational Memory.
 *
 * Purely DOM-driven: finds all `[data-om-badge]` elements in the container,
 * then for each badge measures the region from the previous same-type badge
 * (or the top of the container) down to the bottom of the current badge.
 *
 * Observations span back to the previous badge of any type.
 * Reflections span back to the previous reflection badge (or the beginning).
 *
 * - Only the most recent highlight (regardless of type) is always visible.
 * - Other highlights appear on hover over their badge.
 */
export function BracketOverlay({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [highlights, setHighlights] = useState<HighlightPosition[]>([]);
  const [hoveredCycleId, setHoveredCycleId] = useState<string | null>(null);
  const prevHighlightsRef = useRef<string>("");
  const rafRef = useRef<number>(0);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      if (prevHighlightsRef.current !== "") {
        prevHighlightsRef.current = "";
        setHighlights([]);
      }
      return;
    }

    const containerRect = container.getBoundingClientRect();

    // Find all badge elements in DOM order
    const badges = [...container.querySelectorAll<HTMLElement>("[data-om-badge]")];

    if (badges.length === 0) {
      if (prevHighlightsRef.current !== "") {
        prevHighlightsRef.current = "";
        setHighlights([]);
      }
      return;
    }

    const newHighlights: HighlightPosition[] = [];

    for (let i = 0; i < badges.length; i += 1) {
      const badge = badges[i];
      const cycleId = badge.dataset.omBadge || "";
      const state = (badge.dataset.omState || "complete") as HighlightPosition["state"];
      const omType = (badge.dataset.omType || "observation") as OmType;

      const badgeRect = badge.getBoundingClientRect();

      // Find the anchor point (top of the highlight).
      // - Observations: bottom of the previous badge (any type)
      // - Reflections: bottom of the previous reflection badge
      const anchorBadge = findPreviousBadge(badges, i, omType);
      const top = anchorBadge
        ? anchorBadge.getBoundingClientRect().bottom + HIGHLIGHT_BADGE_PADDING - containerRect.top
        : 0;

      // Keep a little visual padding around the marker without measuring layout margins.
      const bottom = badgeRect.bottom + HIGHLIGHT_BADGE_PADDING - containerRect.top;
      const height = bottom - top;

      if (height <= 0) {
        continue;
      }

      newHighlights.push({
        cycleId,
        height,
        omType,
        state,
        top,
      });
    }

    // Only update state if highlights actually changed (prevents infinite MutationObserver loops)
    const key = JSON.stringify(newHighlights);
    if (key !== prevHighlightsRef.current) {
      prevHighlightsRef.current = key;
      setHighlights(newHighlights);
    }
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    measure();

    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    });
    resizeObserver.observe(container);

    const mutationObserver = new MutationObserver(() => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    });
    mutationObserver.observe(container, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [measure, containerRef]);

  // Listen for hover events on badges
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handleMouseOver = (e: MouseEvent) => {
      const badge = (e.target as HTMLElement).closest("[data-om-badge]") as HTMLElement | null;
      if (badge) {
        setHoveredCycleId(badge.dataset.omBadge ?? null);
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const badge = (e.target as HTMLElement).closest("[data-om-badge]") as HTMLElement | null;
      if (badge) {
        setHoveredCycleId(null);
      }
    };

    container.addEventListener("mouseover", handleMouseOver);
    container.addEventListener("mouseout", handleMouseOut);

    return () => {
      container.removeEventListener("mouseover", handleMouseOver);
      container.removeEventListener("mouseout", handleMouseOut);
    };
  }, [containerRef]);

  if (highlights.length === 0) {
    return null;
  }

  // Show the latest highlight by default, but hide it when hovering another badge
  const latestCycleId = highlights.at(-1)?.cycleId ?? null;

  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 0 }}>
      {highlights.map((highlight) => {
        const isLatest = highlight.cycleId === latestCycleId;
        const isHovered = highlight.cycleId === hoveredCycleId;
        // Show only the hovered highlight, or show latest when nothing is hovered
        const isVisible = hoveredCycleId ? isHovered : isLatest;

        return <HighlightBlock key={highlight.cycleId} highlight={highlight} visible={isVisible} />;
      })}
    </div>
  );
}
