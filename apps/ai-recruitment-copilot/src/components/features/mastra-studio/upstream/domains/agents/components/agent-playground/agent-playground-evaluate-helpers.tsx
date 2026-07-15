import { Button } from "@mastra/playground-ui/components/Button";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { ChevronLeft } from "lucide-react";
import type { AgentExperiment } from "../../hooks/use-agent-experiments";
import type { AgentFormValues } from "../agent-edit-page/utils/form-validation";
import { formatVersionLabel } from "./format-version-label";
import { isDefined } from "../../utils/presence";
import { resolveConditional } from "../../utils/conditional";

export type AgentEvalTab = "experiments" | "datasets" | "scorers";

export type DetailView =
  | null
  | { type: "dataset"; id: string }
  | { type: "scorer"; id: string }
  | {
      type: "new-scorer";
      prefillTestItems?: {
        input: unknown;
        output: unknown;
        expectedDirection: "high" | "low";
      }[];
    }
  | { type: "edit-scorer"; id: string; scorerData: Record<string, unknown> }
  | { type: "experiment"; id: string; datasetId: string };

export interface AgentPlaygroundEvaluateProps {
  agentId: string;
  onSwitchToReview?: () => void;
  pendingScorerItems?: { input: unknown; output: unknown }[] | null;
  onPendingScorerItemsConsumed?: () => void;
}

export type ScorerSampling = NonNullable<AgentFormValues["scorers"]>[string]["sampling"];

export function getScorerSampling(value: unknown): ScorerSampling | undefined {
  if (typeof value !== "object" || value === null || !("sampling" in value)) {
    return undefined;
  }
  return value.sampling as ScorerSampling | undefined;
}

export function renderBackButton(label: string, onClick: () => void) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border1">
      <Button variant="ghost" size="sm" onClick={onClick}>
        <ChevronLeft className="size-4" />
        {label}
      </Button>
    </div>
  );
}

export function parseIdList(ids: unknown): string[] {
  if (Array.isArray(ids)) {
    return ids;
  }
  if (typeof ids === "string") {
    try {
      const parsed = JSON.parse(ids);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // not JSON
    }
    return [ids];
  }
  return [];
}

export function formatDate(dateStr: string | Date | undefined | null): string {
  if (!dateStr) {
    return "—";
  }
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return d.toLocaleDateString("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}

export function getExperimentStartedAtTime(startedAt: AgentExperiment["startedAt"]): number {
  if (!startedAt) {
    return 0;
  }
  return startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt).getTime();
}

export const STATUS_VARIANT: Record<string, "success" | "warning" | "error" | "neutral"> = {
  completed: "success",
  failed: "error",
  pending: "neutral",
  running: "warning",
};

// --- Sub-components ---

export function ExperimentBadge({ experiment }: { experiment: AgentExperiment }) {
  const { status, succeededCount, totalItems } = experiment;

  const versionTags = [
    isDefined(experiment.datasetVersion)
      ? formatVersionLabel("Dataset", experiment.datasetVersion)
      : null,
    experiment.agentVersion ? formatVersionLabel("Agent", experiment.agentVersion) : null,
  ].filter(Boolean);

  const versionLine =
    versionTags.length > 0 ? (
      <Txt variant="ui-xs" className="text-neutral3">
        {versionTags.join(" · ")}
      </Txt>
    ) : null;

  if (status === "running" || status === "pending") {
    return (
      <div className="flex flex-col">
        <Txt variant="ui-xs" className="text-warning1">
          {status === "running" ? "运行中..." : "等待中..."}
        </Txt>
        {versionLine}
      </div>
    );
  }

  if (totalItems === 0) {
    return (
      <div className="flex flex-col">
        <Txt variant="ui-xs" className="text-neutral3">
          暂无结果
        </Txt>
        {versionLine}
      </div>
    );
  }

  const passRate = succeededCount / totalItems;
  const colorClass = resolveConditional(
    passRate >= 0.8,
    () => "text-positive1",
    () => (passRate >= 0.5 ? "text-warning1" : "text-negative1"),
  );

  return (
    <div className="flex flex-col">
      <Txt variant="ui-xs" className={colorClass}>
        {succeededCount}/{totalItems} 通过
      </Txt>
      {versionLine}
    </div>
  );
}
