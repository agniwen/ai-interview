import { useCallback, useEffect } from "react";
import type { ExperimentUISpan } from "../types";
import { getSpanDescendantIds } from "../utils/get-span-descendant-ids";
import { getExperimentSpanTypeUi } from "./experiment-trace-shared";
import { ExperimentTraceTimelineExpandCol } from "./experiment-trace-timeline-expand-col";
import { ExperimentTraceTimelineNameCol } from "./experiment-trace-timeline-name-col";

interface ExperimentTraceTimelineSpanProps {
  span: ExperimentUISpan;
  depth?: number;
  onSpanClick?: (id: string) => void;
  selectedSpanId?: string;
  isLastChild?: boolean;
  fadedTypes?: string[];
  featuredSpanIds?: string[];
  expandedSpanIds?: string[];
  setExpandedSpanIds?: React.Dispatch<React.SetStateAction<string[]>>;
}

export function ExperimentTraceTimelineSpan({
  span,
  depth = 0,
  onSpanClick,
  selectedSpanId,
  isLastChild,
  fadedTypes,
  featuredSpanIds,
  expandedSpanIds,
  setExpandedSpanIds,
}: ExperimentTraceTimelineSpanProps) {
  const hasChildren = span.spans && span.spans.length > 0;
  const numOfChildren = span.spans ? span.spans.length : 0;
  const allDescendantIds = getSpanDescendantIds(span);
  const totalDescendants = allDescendantIds.length;
  const isRootSpan = depth === 0;
  const spanUI = getExperimentSpanTypeUi(span?.type);
  const isExpanded = expandedSpanIds ? expandedSpanIds.includes(span.id) : false;
  const isFadedBySearch =
    featuredSpanIds && featuredSpanIds.length > 0 ? !featuredSpanIds.includes(span.id) : false;
  const isFadedByType =
    fadedTypes && fadedTypes.length > 0 ? fadedTypes.includes(spanUI?.typePrefix || "") : false;
  const isFaded = isFadedByType || isFadedBySearch;

  const toggleChildren = useCallback(() => {
    if (!setExpandedSpanIds || !expandedSpanIds) {
      return;
    }

    if (isExpanded) {
      const idsToRemove = new Set([span.id, ...allDescendantIds]);
      setExpandedSpanIds(expandedSpanIds.filter((id) => !idsToRemove.has(id)));
    } else {
      setExpandedSpanIds([...expandedSpanIds, span.id]);
    }
  }, [allDescendantIds, expandedSpanIds, isExpanded, setExpandedSpanIds, span.id]);

  useEffect(() => {
    if (isRootSpan) {
      setExpandedSpanIds?.([span.id]);
    }
  }, [isRootSpan, span.id, setExpandedSpanIds]);

  useEffect(() => {
    if (!featuredSpanIds || !span.spans || span.spans.length === 0) {
      return;
    }
    const hasFeaturedChildren = span.spans.some((childSpan) =>
      featuredSpanIds.includes(childSpan.id),
    );
    if (!isExpanded && hasFeaturedChildren) {
      toggleChildren();
    }
  }, [featuredSpanIds, isExpanded, span.spans, toggleChildren]);

  const expandAllDescendants = () => {
    if (!setExpandedSpanIds || !expandedSpanIds) {
      return;
    }
    setExpandedSpanIds([...expandedSpanIds, span.id, ...allDescendantIds]);
  };

  const allDescendantsExpanded = allDescendantIds.every((id) => expandedSpanIds?.includes(id));

  return (
    <>
      <ExperimentTraceTimelineNameCol
        span={span}
        spanUI={spanUI}
        isFaded={isFaded}
        depth={depth}
        onSpanClick={onSpanClick}
        selectedSpanId={selectedSpanId}
        isLastChild={isLastChild}
        hasChildren={hasChildren}
        isRootSpan={isRootSpan}
        isExpanded={isExpanded}
        toggleChildren={toggleChildren}
      />
      <ExperimentTraceTimelineExpandCol
        isSelected={selectedSpanId === span.id}
        isFaded={isFaded}
        isExpanded={isExpanded}
        toggleChildren={toggleChildren}
        expandAllDescendants={expandAllDescendants}
        totalDescendants={totalDescendants}
        allDescendantsExpanded={allDescendantsExpanded}
        numOfChildren={numOfChildren}
      />

      {/* <ExperimentTraceTimelineNameCol
        span={span}
        spanUI={spanUI}
        isFaded={isFaded}
        depth={depth}
        onSpanClick={onSpanClick}
        selectedSpanId={selectedSpanId}
        isLastChild={isLastChild}
        hasChildren={hasChildren}
        isRootSpan={isRootSpan}
        isExpanded={isExpanded}
        toggleChildren={toggleChildren}
      />

      <ExperimentTraceTimelineExpandCol
        isSelected={selectedSpanId === span.id}
        isFaded={isFaded}
        isExpanded={isExpanded}
        toggleChildren={toggleChildren}
        expandAllDescendants={expandAllDescendants}
        totalDescendants={totalDescendants}
        allDescendantsExpanded={allDescendantsExpanded}
        numOfChildren={numOfChildren}
      />

      <ExperimentTraceTimelineTimingCol
        span={span}
        selectedSpanId={selectedSpanId}
        isFaded={isFaded}
        overallLatency={overallLatency}
        overallStartTime={overallStartTime}
        overallEndTime={overallEndTime}
        color={spanUI?.color}
      /> */}

      {hasChildren &&
        isExpanded &&
        span.spans?.map((childSpan: ExperimentUISpan, idx: number, array: ExperimentUISpan[]) => {
          const childIsLast = idx === array.length - 1;

          return (
            <ExperimentTraceTimelineSpan
              key={childSpan.id}
              span={childSpan}
              depth={depth + 1}
              onSpanClick={onSpanClick}
              selectedSpanId={selectedSpanId}
              isLastChild={childIsLast}
              fadedTypes={fadedTypes}
              expandedSpanIds={expandedSpanIds}
              setExpandedSpanIds={setExpandedSpanIds}
              featuredSpanIds={featuredSpanIds}
            />
          );
        })}
    </>
  );
}
