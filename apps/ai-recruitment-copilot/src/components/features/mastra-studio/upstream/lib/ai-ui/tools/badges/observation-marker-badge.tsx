import { Badge } from "@mastra/playground-ui/components/Badge";
import { MarkdownRenderer } from "@mastra/playground-ui/components/MarkdownRenderer";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { cn } from "@mastra/playground-ui/utils/cn";
import { Brain, XCircle, Loader2, ChevronDown, ChevronRight, Unplug, Eye } from "lucide-react";
import { useState, useEffect } from "react";
import { ObservationRenderer } from "./observation-renderer";

export interface OmMarkerData {
  observedAt?: string;
  completedAt?: string;
  failedAt?: string;
  disconnectedAt?: string;
  startedAt?: string;
  tokensObserved?: number;
  tokensToObserve?: number;
  observationTokens?: number;
  observations?: string;
  currentTask?: string;
  suggestedResponse?: string;
  extractedValues?: Record<string, unknown>;
  extractionFailures?: { slug: string; error: string }[];
  durationMs?: number;
  error?: string;
  recordId?: string;
  cycleId?: string;
  threadId?: string;
  threadIds?: string[];
  operationType?: "observation" | "reflection";
  _state?:
    | "loading"
    | "complete"
    | "failed"
    | "buffering"
    | "buffering-complete"
    | "buffering-failed"
    | "activated";
  // Activation-specific fields
  chunksActivated?: number;
  tokensActivated?: number;
  messagesActivated?: number;
  config?: {
    scope?: string;
    messageTokens?: number;
    observationTokens?: number;
  };
  // Buffering-specific fields
  tokensToBuffer?: number;
  tokensBuffered?: number;
  bufferedTokens?: number;
}

export interface ObservationMarkerBadgeProps {
  toolName: string;
  args: Record<string, unknown>;
  metadata?: {
    mode?: string;
    omData?: OmMarkerData;
  };
}

/**
 * Format token count for display (e.g., 7234 -> "7.2k", 234 -> "234")
 */
const formatTokens = (tokens: number): string => {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return String(Math.round(tokens));
};

const hasExtractedValue = (value: unknown) => value !== undefined && value !== null && value !== "";

const getExtractedValueEntries = (values?: Record<string, unknown>) =>
  Object.entries(values ?? {}).filter(([, value]) => hasExtractedValue(value));

const formatExtractedValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
};

const isStructuredExtractedValue = (value: unknown) => typeof value === "object" && value !== null;

const ObservationIcon = ({ className }: { className?: string }) => <Eye className={className} />;

const ExpandIcon = ({
  expanded,
  className = "w-3 h-3",
}: {
  expanded: boolean;
  className?: string;
}) => (expanded ? <ChevronDown className={className} /> : <ChevronRight className={className} />);

const MarkerTypeIcon = ({ reflection }: { reflection: boolean }) =>
  reflection ? <Brain className="w-3 h-3" /> : <ObservationIcon className="w-3 h-3" />;

const optionalTokens = (tokens?: number) => (tokens ? formatTokens(tokens) : "?");
const optionalRatio = (ratio: number | null) => (ratio ? ` (-${ratio}x)` : "");

const ObservationStats = ({
  tokensObserved,
  observationTokens,
  compressionRatio,
  durationMs,
  className,
}: {
  tokensObserved?: number;
  observationTokens?: number;
  compressionRatio: number | null;
  durationMs?: number;
  className: string;
}) => (
  <div className={`flex gap-4 text-[11px] ${className}`}>
    {tokensObserved ? <span>输入：{formatTokens(tokensObserved)}</span> : null}
    {observationTokens ? <span>输出：{formatTokens(observationTokens)}</span> : null}
    {compressionRatio && compressionRatio > 1 ? <span>压缩比：{compressionRatio}x</span> : null}
    {durationMs ? <span>耗时：{(durationMs / 1000).toFixed(2)} 秒</span> : null}
  </div>
);

const getMarkerState = (
  data: OmMarkerData,
): NonNullable<OmMarkerData["_state"]> | "disconnected" => {
  if (data._state) {
    return data._state;
  }
  if (data.failedAt) {
    return "failed";
  }
  if (data.completedAt) {
    return "complete";
  }
  return data.disconnectedAt ? "disconnected" : "loading";
};

const MarkerPill = ({
  children,
  icon,
  expanded,
  onClick,
  className,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  expanded?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}) => {
  const content = (
    <>
      {onClick && (
        <Icon>
          <ChevronDown className={cn("transition-all", expanded ? "rotate-0" : "-rotate-90")} />
        </Icon>
      )}
      <Badge icon={icon}>{children}</Badge>
    </>
  );

  if (!onClick) {
    return <div className={cn("inline-flex items-center gap-2", className)}>{content}</div>;
  }

  return (
    <button
      onClick={onClick}
      className={cn("inline-flex items-center gap-2", className)}
      type="button"
    >
      {content}
    </button>
  );
};

const ExtractedValuesPanel = ({
  extractedValues,
  extractionFailures,
  isExpanded,
  onToggle,
}: {
  extractedValues?: Record<string, unknown>;
  extractionFailures?: { slug: string; error: string }[];
  isExpanded: boolean;
  onToggle: () => void;
}) => {
  const entries = getExtractedValueEntries(extractedValues);
  const failures = extractionFailures ?? [];

  if (entries.length === 0 && failures.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 pt-2 border-t border-neutral-700">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-[10px] font-medium text-foreground uppercase tracking-wide hover:opacity-80 transition-opacity"
      >
        {isExpanded ? (
          <ChevronDown className="w-2.5 h-2.5" />
        ) : (
          <ChevronRight className="w-2.5 h-2.5" />
        )}
        提取结果（{entries.length}）{failures.length > 0 ? ` · ${failures.length} 项失败` : ""}
      </button>
      {isExpanded && (
        <div className="mt-1 space-y-2">
          {entries.map(([slug, value]) => (
            <div
              key={slug}
              className="rounded border border-neutral-700/60 bg-black/5 p-2 dark:bg-white/5"
            >
              <div className="text-[10px] font-medium uppercase tracking-wide text-foreground/70">
                {slug}
              </div>
              {isStructuredExtractedValue(value) ? (
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px] text-foreground/80">
                  {formatExtractedValue(value)}
                </pre>
              ) : (
                <div className="mt-1 text-[11px] text-foreground/80 [&_code]:bg-black/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[10px]">
                  <MarkdownRenderer>{formatExtractedValue(value)}</MarkdownRenderer>
                </div>
              )}
            </div>
          ))}
          {failures.map((failure) => (
            <div
              key={failure.slug}
              className="rounded border border-red-500/20 bg-red-500/5 p-2 text-red-700"
            >
              <div className="text-[10px] font-medium uppercase tracking-wide">{failure.slug}</div>
              <div className="mt-1 text-[11px]">{failure.error}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Renders an inline badge for OM observation markers.
 * These are converted from data-om-* parts to tool-call format for assistant-ui compatibility.
 *
 * The badge includes a `data-om-badge` attribute with the cycleId so that
 * the BracketOverlay can find it via DOM queries for positioning bracket lines.
 */
export const ObservationMarkerBadge = ({
  toolName,
  args,
  metadata,
}: ObservationMarkerBadgeProps) => {
  const omData = (metadata?.omData || args) as OmMarkerData;
  const cycleId = omData.cycleId || "";

  // Use the _state field set during part merging, or fallback to detecting from data
  const state = getMarkerState(omData);

  const isFailed = state === "failed";
  const isReflection = omData.operationType === "reflection";
  const hasExtractionContent =
    getExtractedValueEntries(omData.extractedValues).length > 0 ||
    (omData.extractionFailures?.length ?? 0) > 0;
  const shouldAutoExpand = (isFailed && isReflection) || hasExtractionContent;

  // Failed reflections and extraction-bearing markers should expand by default to draw attention to new details.
  const [isExpanded, setIsExpanded] = useState(shouldAutoExpand);

  // Auto-expand when completion details arrive after the marker was mounted during loading.
  useEffect(() => {
    if (shouldAutoExpand) {
      setIsExpanded(true);
    }
  }, [shouldAutoExpand]);
  const [isObservationsExpanded, setIsObservationsExpanded] = useState(true);
  const [isTaskExpanded, setIsTaskExpanded] = useState(false);
  const [isResponseExpanded, setIsResponseExpanded] = useState(false);
  const [isExtractedExpanded, setIsExtractedExpanded] = useState(false);

  // Colors - same scheme for both observation and reflection
  const bgColor = "bg-blue-500/10";
  const textColor = "text-blue-600";
  const completeBgColor = "bg-green-500/10";
  const completeTextColor = "text-green-600";
  const completeHoverBgColor = "hover:bg-green-500/20";
  // Same colors for expanded state
  const expandedBgColor = "bg-green-500/5";
  const expandedBorderColor = "border-green-500/10";
  const labelColor = "text-green-600";
  const bufferExpandedBgColor = "bg-surface2";
  const bufferExpandedBorderColor = "border-border-1";
  const actionLabel = isReflection ? "反思中" : "观测中";
  const completedLabel = isReflection ? "已反思" : "已观测";

  // Render based on marker type
  const renderStart = () => {
    const { tokensToObserve } = omData;
    return (
      <div
        className="mb-3"
        data-om-badge={cycleId}
        data-om-state={state}
        data-om-type={isReflection ? "reflection" : "observation"}
      >
        <div
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md ${bgColor} ${textColor} text-xs font-medium my-1`}
        >
          <Loader2 className="w-3 h-3 animate-spin" />
          <MarkerTypeIcon reflection={isReflection} />
          <span>
            {actionLabel}
            {tokensToObserve ? ` ~${formatTokens(tokensToObserve)} Token` : "..."}
          </span>
        </div>
      </div>
    );
  };

  const renderEnd = () => {
    const { tokensObserved } = omData;
    const { observationTokens } = omData;
    const { observations } = omData;
    const { currentTask } = omData;
    const { suggestedResponse } = omData;
    const { extractedValues } = omData;
    const { extractionFailures } = omData;
    const { durationMs } = omData;
    const compressionRatio =
      tokensObserved && observationTokens && observationTokens > 0
        ? Math.round(tokensObserved / observationTokens)
        : null;

    const handleToggle = (e: React.MouseEvent) => {
      // Prevent scroll jump by preserving scroll position
      const scrollContainer =
        e.currentTarget.closest("[data-radix-scroll-area-viewport]") || document.documentElement;
      const { scrollTop } = scrollContainer;
      setIsExpanded(!isExpanded);
      // Restore scroll position after React updates
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollTop;
      });
    };

    return (
      <div
        className="mb-3"
        data-om-badge={cycleId}
        data-om-state={state}
        data-om-type={isReflection ? "reflection" : "observation"}
      >
        <div className="my-1">
          <button
            onClick={handleToggle}
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md ${completeBgColor} ${completeTextColor} text-xs font-medium ${completeHoverBgColor} transition-colors cursor-pointer`}
          >
            <ExpandIcon expanded={isExpanded} />
            <MarkerTypeIcon reflection={isReflection} />
            <span>
              {completedLabel} {optionalTokens(tokensObserved)}→{optionalTokens(observationTokens)}{" "}
              Token
              {optionalRatio(compressionRatio)}
            </span>
          </button>
          {isExpanded && (
            <div
              className={`mt-1 ml-6 p-2 rounded-md ${expandedBgColor} text-xs space-y-1.5 border ${expandedBorderColor}`}
            >
              {/* Stats row - all green */}
              <ObservationStats
                tokensObserved={tokensObserved}
                observationTokens={observationTokens}
                compressionRatio={compressionRatio}
                durationMs={durationMs}
                className={labelColor}
              />
              {observations && (
                <div className={`mt-1 pt-1 border-t border-neutral-700`}>
                  {/* If there's no currentTask or suggestedResponse, show observations directly without collapsible wrapper */}
                  {!currentTask && !suggestedResponse ? (
                    <ObservationRenderer observations={observations} maxHeight="500px" />
                  ) : (
                    <>
                      <button
                        onClick={() => setIsObservationsExpanded(!isObservationsExpanded)}
                        className="flex items-center gap-1 text-[10px] font-medium text-foreground uppercase tracking-wide hover:opacity-80 transition-opacity"
                      >
                        {isObservationsExpanded ? (
                          <ChevronDown className="w-2.5 h-2.5" />
                        ) : (
                          <ChevronRight className="w-2.5 h-2.5" />
                        )}
                        {isReflection ? "反思结果" : "观测结果"}
                      </button>
                      {isObservationsExpanded && (
                        <div className="mt-1">
                          <ObservationRenderer observations={observations} maxHeight="500px" />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {currentTask && (
                <div className={`mt-2 pt-2 border-t border-neutral-700`}>
                  <button
                    onClick={() => setIsTaskExpanded(!isTaskExpanded)}
                    className="flex items-center gap-1 text-[10px] font-medium text-foreground uppercase tracking-wide hover:opacity-80 transition-opacity"
                  >
                    {isTaskExpanded ? (
                      <ChevronDown className="w-2.5 h-2.5" />
                    ) : (
                      <ChevronRight className="w-2.5 h-2.5" />
                    )}
                    当前任务
                  </button>
                  {isTaskExpanded && (
                    <div className="mt-1 text-[11px] text-foreground [&_code]:bg-black/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[10px]">
                      <MarkdownRenderer>{currentTask}</MarkdownRenderer>
                    </div>
                  )}
                </div>
              )}
              {suggestedResponse && (
                <div className={`mt-2 pt-2 border-t border-neutral-700`}>
                  <button
                    onClick={() => setIsResponseExpanded(!isResponseExpanded)}
                    className="flex items-center gap-1 text-[10px] font-medium text-foreground uppercase tracking-wide hover:opacity-80 transition-opacity"
                  >
                    {isResponseExpanded ? (
                      <ChevronDown className="w-2.5 h-2.5" />
                    ) : (
                      <ChevronRight className="w-2.5 h-2.5" />
                    )}
                    建议回复
                  </button>
                  {isResponseExpanded && (
                    <div className="mt-1 text-[11px] text-foreground/80 italic [&_code]:bg-black/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[10px]">
                      <MarkdownRenderer>{suggestedResponse}</MarkdownRenderer>
                    </div>
                  )}
                </div>
              )}
              <ExtractedValuesPanel
                extractedValues={extractedValues}
                extractionFailures={extractionFailures}
                isExpanded={isExtractedExpanded}
                onToggle={() => setIsExtractedExpanded(!isExtractedExpanded)}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDisconnected = () => {
    const disconnectedLabel = isReflection ? "反思已中断" : "观测已中断";
    const { tokensToObserve } = omData;
    return (
      <div
        className="mb-3"
        data-om-badge={cycleId}
        data-om-state={state}
        data-om-type={isReflection ? "reflection" : "observation"}
      >
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-yellow-500/10 text-yellow-600 text-xs font-medium my-1">
          <Unplug className="w-3 h-3" />
          <span>
            {disconnectedLabel}
            {tokensToObserve ? `（约 ${formatTokens(tokensToObserve)} Token）` : ""}
          </span>
        </div>
      </div>
    );
  };

  const renderFailed = () => {
    const { error } = omData;
    const failedLabel = isReflection ? "反思失败" : "观测失败";
    return (
      <div
        className="mb-3"
        data-om-badge={cycleId}
        data-om-state={state}
        data-om-type={isReflection ? "reflection" : "observation"}
      >
        <div className="my-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/10 text-red-600 text-xs font-medium hover:bg-red-500/20 transition-colors cursor-pointer"
          >
            <ExpandIcon expanded={isExpanded} />
            <XCircle className="w-3 h-3" />
            <span>{failedLabel}</span>
          </button>

          {isExpanded && error && (
            <div className="mt-1 ml-4 p-2 rounded-md bg-red-500/5 text-red-700 text-xs border border-red-500/10">
              <span className="font-medium">错误：</span> {error}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Async buffering states - non-blocking background observation/reflection
  const renderBuffering = () => {
    const { tokensToBuffer } = omData;
    const bufferingLabel = isReflection ? "正在缓冲反思" : "正在缓冲观测结果";
    return (
      <div
        className="mt-2 mb-8"
        data-om-badge={cycleId}
        data-om-state={state}
        data-om-type={isReflection ? "reflection" : "observation"}
      >
        <MarkerPill icon={<Loader2 className="animate-spin text-accent6" />}>
          {bufferingLabel}
          {tokensToBuffer ? ` ~${formatTokens(tokensToBuffer)} Token` : "..."}
        </MarkerPill>
      </div>
    );
  };

  const renderBufferingComplete = () => {
    const { tokensBuffered } = omData;
    const { bufferedTokens } = omData;
    const { observations, extractedValues, extractionFailures } = omData;
    const bufferedLabel = isReflection ? "已缓冲反思" : "已缓冲观测结果";
    const compressionRatio =
      tokensBuffered && bufferedTokens && bufferedTokens > 0
        ? Math.round(tokensBuffered / bufferedTokens)
        : null;

    const handleToggle = (e: React.MouseEvent) => {
      const scrollContainer =
        e.currentTarget.closest("[data-radix-scroll-area-viewport]") || document.documentElement;
      const { scrollTop } = scrollContainer;
      setIsExpanded(!isExpanded);
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollTop;
      });
    };

    return (
      <div
        className="mt-2 mb-8"
        data-om-badge={cycleId}
        data-om-state={state}
        data-om-type={isReflection ? "reflection" : "observation"}
      >
        <div>
          <MarkerPill
            expanded={isExpanded}
            onClick={handleToggle}
            icon={<ObservationIcon className="text-accent6" />}
          >
            {bufferedLabel} {tokensBuffered ? formatTokens(tokensBuffered) : "?"}→
            {bufferedTokens ? formatTokens(bufferedTokens) : "?"} Token
            {compressionRatio ? ` (-${compressionRatio}x)` : ""}
          </MarkerPill>

          {isExpanded && (
            <div
              className={`mt-2 ml-6 rounded-lg ${bufferExpandedBgColor} p-4 text-xs space-y-2 border ${bufferExpandedBorderColor}`}
            >
              {observations && (
                <ObservationRenderer observations={observations} maxHeight="240px" />
              )}
              <ExtractedValuesPanel
                extractedValues={extractedValues}
                extractionFailures={extractionFailures}
                isExpanded={isExtractedExpanded}
                onToggle={() => setIsExtractedExpanded(!isExtractedExpanded)}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderBufferingFailed = () => {
    const { error } = omData;
    const failedLabel = isReflection ? "缓冲反思失败" : "缓冲观测结果失败";
    return (
      <div
        className="mb-3"
        data-om-badge={cycleId}
        data-om-state={state}
        data-om-type={isReflection ? "reflection" : "observation"}
      >
        <div className="my-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/10 text-red-600 text-xs font-medium hover:bg-red-500/20 transition-colors cursor-pointer border border-dashed border-red-400/40"
          >
            <ExpandIcon expanded={isExpanded} />
            <XCircle className="w-3 h-3" />
            <span>{failedLabel}</span>
          </button>

          {isExpanded && error && (
            <div className="mt-1 ml-4 p-2 rounded-md bg-red-500/5 text-red-700 text-xs border border-red-500/10">
              <span className="font-medium">错误：</span> {error}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Activation state - buffered observations have been activated into active observations
  // Styled to match sync observation/reflection markers (green scheme with Brain icon)
  const renderActivated = () => {
    const tokensActivated = omData.tokensActivated ?? 0;
    const observationTokens = omData.observationTokens ?? 0;
    const { observations } = omData;
    const activatedLabel = isReflection ? "已反思" : "已观测";
    const compressionRatio =
      tokensActivated && observationTokens && observationTokens > 0
        ? Math.round(tokensActivated / observationTokens)
        : null;

    const handleToggle = (e: React.MouseEvent) => {
      const scrollContainer =
        e.currentTarget.closest("[data-radix-scroll-area-viewport]") || document.documentElement;
      const { scrollTop } = scrollContainer;
      setIsExpanded(!isExpanded);
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollTop;
      });
    };

    return (
      <div
        className="mb-3"
        data-om-badge={cycleId}
        data-om-state={state}
        data-om-type={isReflection ? "reflection" : "observation"}
        data-om-no-highlight="true"
      >
        <div className="my-1">
          <button
            onClick={handleToggle}
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md ${completeBgColor} ${completeTextColor} text-xs font-medium ${completeHoverBgColor} transition-colors cursor-pointer`}
          >
            <ExpandIcon expanded={isExpanded} />
            <MarkerTypeIcon reflection={isReflection} />
            <span>
              {activatedLabel} {tokensActivated ? formatTokens(tokensActivated) : "?"}→
              {observationTokens ? formatTokens(observationTokens) : "?"} Token
              {compressionRatio ? ` (-${compressionRatio}x)` : ""}
            </span>
          </button>
          {isExpanded && (
            <div
              className={`mt-1 ml-6 p-2 rounded-md ${expandedBgColor} text-xs space-y-1.5 border ${expandedBorderColor}`}
            >
              {/* Stats row */}
              <div className={`flex gap-4 text-[11px] ${labelColor}`}>
                {tokensActivated > 0 && <span>输入：{formatTokens(tokensActivated)}</span>}
                {observationTokens > 0 && <span>输出：{formatTokens(observationTokens)}</span>}
                {compressionRatio && compressionRatio > 1 && (
                  <span>压缩比：{compressionRatio}x</span>
                )}
              </div>
              {observations && (
                <div className="mt-1 pt-1 border-t border-neutral-700">
                  <ObservationRenderer observations={observations} maxHeight="500px" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Unknown marker type - render generic
  const renderGeneric = () => (
    <div
      className="mb-3"
      data-om-badge={cycleId}
      data-om-state={state}
      data-om-type={isReflection ? "reflection" : "observation"}
    >
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-500/10 text-gray-600 text-xs font-medium my-1">
        <Brain className="w-3 h-3" />
        <span>{toolName}</span>
      </div>
    </div>
  );

  const renderers: Record<string, () => React.ReactNode> = {
    activated: renderActivated,
    buffering: renderBuffering,
    "buffering-complete": renderBufferingComplete,
    "buffering-failed": renderBufferingFailed,
    complete: renderEnd,
    disconnected: renderDisconnected,
    failed: renderFailed,
    loading: renderStart,
  };
  return renderers[state]?.() ?? renderGeneric();
};
