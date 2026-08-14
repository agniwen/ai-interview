import type { GetScorerResponse } from "@mastra/client-js";
import { Button } from "@mastra/playground-ui/components/Button";
import { SelectFieldBlock } from "@mastra/playground-ui/components/FormFieldBlocks";
import { Notice } from "@mastra/playground-ui/components/Notice";
import { TextAndIcon } from "@mastra/playground-ui/components/Text";
import { toast } from "@mastra/playground-ui/utils/toast";
import { InfoIcon } from "lucide-react";
import { useState } from "react";
import { useTriggerScorer } from "../hooks/use-trigger-scorer";

export interface SpanScoringProps {
  traceId?: string;
  spanId?: string;
  entityType?: string;
  isTopLevelSpan?: boolean;
  scorers?: Record<string, GetScorerResponse>;
  isLoadingScorers?: boolean;
}

export function SpanScoring({
  traceId,
  spanId,
  entityType,
  isTopLevelSpan,
  scorers,
  isLoadingScorers,
}: SpanScoringProps) {
  const [selectedScorer, setSelectedScorer] = useState<string | null>(null);
  const { mutate: triggerScorer, isPending } = useTriggerScorer();

  let scorerList = Object.entries(scorers || {})
    .map(([key, scorer]) => ({
      description: scorer.scorer.config.description,
      id: key,
      isRegistered: scorer.isRegistered,
      name: scorer.scorer.config.name,
      type: scorer.scorer.config.type,
    }))
    .filter((scorer) => scorer.isRegistered);

  // Filter out Scorers with type agent if we are not scoring on a top level agent generated span
  if (entityType !== "Agent" || !isTopLevelSpan) {
    scorerList = scorerList.filter((scorer) => scorer.type !== "agent");
  }

  const isWaiting = isPending || isLoadingScorers;

  const handleStartScoring = () => {
    if (selectedScorer && traceId) {
      triggerScorer(
        { scorerName: selectedScorer, spanId, traceId },
        {
          onSuccess: () =>
            toast.info("评分器已触发", {
              description: "评分完成后将在此显示结果。",
            }),
        },
      );
    }
  };

  const selectedScorerDescription =
    scorerList.find((s) => s.id === selectedScorer)?.description || "";

  if (scorers === undefined && !isLoadingScorers) {
    return <Notice variant="destructive">加载评分器失败。</Notice>;
  }

  if (!isLoadingScorers && scorerList.length === 0) {
    return <Notice variant="info">尚未定义可运行的评分器。</Notice>;
  }

  return (
    <div className="grid grid-cols-[3fr_1fr] gap-4 items-start">
      <div className="grid gap-2">
        <SelectFieldBlock
          name="select-scorer"
          label="选择评分器"
          labelIsHidden={true}
          placeholder="选择评分器..."
          options={scorerList.map((scorer) => ({
            label: scorer.name || scorer.id,
            value: scorer.id || scorer.name || "",
          }))}
          onValueChange={setSelectedScorer}
          value={selectedScorer || ""}
          className="min-w-80"
          disabled={isWaiting}
        />
        {selectedScorerDescription && (
          <TextAndIcon className="text-neutral3 text-ui-sm">
            <InfoIcon /> {selectedScorerDescription}
          </TextAndIcon>
        )}
      </div>

      <Button disabled={!selectedScorer || isWaiting} onClick={handleStartScoring}>
        {isPending ? "正在启动..." : "开始评分"}
      </Button>
    </div>
  );
}
