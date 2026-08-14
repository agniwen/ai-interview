import type { ExperimentUISpan } from "../types";

/** Minimal span fields required for building the hierarchical timeline tree. */
interface TimelineSpan {
  spanId: string;
  name: string;
  spanType: string;
  startedAt: Date | string;
  endedAt?: Date | string | null;
  parentSpanId?: string | null;
}

function sortSpansByStartTime(spans: ExperimentUISpan[]): ExperimentUISpan[] {
  return spans.toSorted(
    (first, second) => new Date(first.startTime).getTime() - new Date(second.startTime).getTime(),
  );
}

function sortNestedSpans(items: ExperimentUISpan[]): void {
  for (const span of items) {
    if (span.spans && span.spans.length > 0) {
      span.spans = sortSpansByStartTime(span.spans);
      sortNestedSpans(span.spans);
    }
  }
}

function getOverallEndDate(spans: TimelineSpan[]): Date | null {
  let overallEndDate: Date | null = null;
  for (const span of spans) {
    const endDate = span.endedAt ? new Date(span.endedAt) : undefined;
    if (endDate && (!overallEndDate || endDate > overallEndDate)) {
      overallEndDate = endDate;
    }
  }
  return overallEndDate;
}

export const formatTraceSpans = (spans: TimelineSpan[]): ExperimentUISpan[] => {
  if (!spans || spans.length === 0) {
    return [];
  }

  const overallEndDate = getOverallEndDate(spans);

  // Create a map for quick lookup of spans by spanId
  const spanMap = new Map<string, ExperimentUISpan>();
  const rootSpans: ExperimentUISpan[] = [];

  // First pass: create ExperimentUISpan objects and initialize spans array
  for (const spanRecord of spans) {
    const startDate = new Date(spanRecord.startedAt);
    const endDate = spanRecord.endedAt ? new Date(spanRecord.endedAt) : undefined;

    const uiSpan: ExperimentUISpan = {
      endTime: endDate ? endDate.toISOString() : undefined,
      id: spanRecord.spanId,
      latency: endDate ? endDate.getTime() - startDate.getTime() : 0,
      name: spanRecord.name,
      parentSpanId: spanRecord.parentSpanId,
      spans: [],
      startTime: startDate.toISOString(),
      type: spanRecord.spanType,
    };

    spanMap.set(spanRecord.spanId, uiSpan);
  }

  // Second pass: organize into tree structure
  for (const spanRecord of spans) {
    const uiSpan = spanMap.get(spanRecord.spanId);
    if (!uiSpan) {
      continue;
    }

    if (spanRecord.parentSpanId === null || spanRecord.parentSpanId === undefined) {
      if (overallEndDate && uiSpan.endTime && overallEndDate > new Date(uiSpan.endTime)) {
        uiSpan.endTime = overallEndDate.toISOString();
        const overallEndTime = new Date(overallEndDate).getTime();
        const spanStartTime = new Date(uiSpan.startTime).getTime();
        uiSpan.latency = overallEndTime - spanStartTime;
      }
      rootSpans.push(uiSpan);
    } else {
      const parent = spanMap.get(spanRecord.parentSpanId);
      if (parent) {
        parent.spans = [...(parent.spans ?? []), uiSpan];
      } else {
        rootSpans.push(uiSpan);
      }
    }
  }

  const sortedRootSpans = sortSpansByStartTime(rootSpans);
  sortNestedSpans(sortedRootSpans);

  return sortedRootSpans;
};
