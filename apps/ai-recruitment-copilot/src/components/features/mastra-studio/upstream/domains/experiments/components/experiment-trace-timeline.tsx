import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { cn } from "@mastra/playground-ui/utils/cn";
import type { ExperimentUISpan } from "../types";
import { ExperimentTraceTimelineSpan } from "./experiment-trace-timeline-span";

interface ExperimentTraceTimelineProps {
  hierarchicalSpans: ExperimentUISpan[];
  onSpanClick: (id: string) => void;
  selectedSpanId?: string;
  isLoading?: boolean;
  fadedTypes?: string[];
  expandedSpanIds?: string[];
  setExpandedSpanIds?: React.Dispatch<React.SetStateAction<string[]>>;
  featuredSpanIds?: string[];
}

export function ExperimentTraceTimeline({
  hierarchicalSpans = [],
  onSpanClick,
  selectedSpanId,
  isLoading,
  fadedTypes,
  expandedSpanIds,
  setExpandedSpanIds,
  featuredSpanIds,
}: ExperimentTraceTimelineProps) {
  return (
    <>
      {isLoading ? (
        <div
          className={cn(
            "flex items-center text-ui-md gap-4 bg-surface3/50 rounded-md p-6 justify-center text-neutral3",
            "[&_svg]:w-[1.25em] [&_svg]:h-[1.25em] [&_svg]:opacity-50",
          )}
        >
          <Spinner /> 正在加载追踪时间线...
        </div>
      ) : (
        <div
          // className={cn('grid items-start content-start gap-y-0.5 overflow-hidden grid-cols-[1fr_10rem] xl:py-4', {
          //   'xl:grid-cols-[1fr_auto_10rem]': !overallEndTime,
          //   'xl:grid-cols-[1fr_auto_20rem]': overallEndTime,
          // })}
          className="grid grid-cols-[1fr_auto]"
          // style={{ border: '2px dashed yellow' }}
        >
          {hierarchicalSpans?.map((span) => (
            <ExperimentTraceTimelineSpan
              key={span.id}
              span={span}
              onSpanClick={onSpanClick}
              selectedSpanId={selectedSpanId}
              fadedTypes={fadedTypes}
              featuredSpanIds={featuredSpanIds}
              expandedSpanIds={expandedSpanIds}
              setExpandedSpanIds={setExpandedSpanIds}
            />
          ))}
        </div>
      )}
    </>
  );
}
