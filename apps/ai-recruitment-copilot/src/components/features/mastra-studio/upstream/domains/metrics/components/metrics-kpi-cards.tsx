import { KpiCardView } from "@mastra/playground-ui/domains/metrics/components/kpi-card-view";
import {
  formatCompact,
  formatCost,
} from "@mastra/playground-ui/domains/metrics/components/metrics-utils";
import { useActiveResourcesKpiMetrics } from "@mastra/playground-ui/domains/metrics/hooks/use-active-resources-kpi-metrics";
import { useActiveThreadsKpiMetrics } from "@mastra/playground-ui/domains/metrics/hooks/use-active-threads-kpi-metrics";
import { useAgentRunsKpiMetrics } from "@mastra/playground-ui/domains/metrics/hooks/use-agent-runs-kpi-metrics";
import { useModelCostKpiMetrics } from "@mastra/playground-ui/domains/metrics/hooks/use-model-cost-kpi-metrics";
import { useTotalTokensKpiMetrics } from "@mastra/playground-ui/domains/metrics/hooks/use-total-tokens-kpi-metrics";

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function AgentRunsKpiCard() {
  const { data, isLoading, isError } = useAgentRunsKpiMetrics();
  return (
    <KpiCardView
      label="Total Agent Runs"
      value={isDefined(data?.value) ? data.value.toLocaleString() : null}
      prevValue={isDefined(data?.previousValue) ? data.previousValue.toLocaleString() : undefined}
      changePct={data?.changePercent ?? null}
      isLoading={isLoading}
      isError={isError}
    />
  );
}

export function ModelCostKpiCard() {
  const { data, isLoading, isError } = useModelCostKpiMetrics();
  return (
    <KpiCardView
      label="Total Model Cost"
      value={isDefined(data?.cost) ? formatCost(data.cost, data.costUnit) : null}
      prevValue={
        isDefined(data?.previousCost) ? formatCost(data.previousCost, data.costUnit) : undefined
      }
      changePct={data?.costChangePercent ?? null}
      isLoading={isLoading}
      isError={isError}
    />
  );
}

export function TotalTokensKpiCard() {
  const { data, isLoading, isError } = useTotalTokensKpiMetrics();
  return (
    <KpiCardView
      label="Total Tokens"
      value={isDefined(data?.value) ? formatCompact(data.value) : null}
      prevValue={isDefined(data?.previousValue) ? formatCompact(data.previousValue) : undefined}
      changePct={data?.changePercent ?? null}
      isLoading={isLoading}
      isError={isError}
    />
  );
}

export function ActiveThreadsKpiCard() {
  const { data, isLoading, isError } = useActiveThreadsKpiMetrics();
  return (
    <KpiCardView
      label="Total Threads"
      value={isDefined(data?.value) ? formatCompact(data.value) : null}
      prevValue={isDefined(data?.previousValue) ? formatCompact(data.previousValue) : undefined}
      changePct={data?.changePercent ?? null}
      isLoading={isLoading}
      isError={isError}
    />
  );
}

export function ActiveResourcesKpiCard() {
  const { data, isLoading, isError } = useActiveResourcesKpiMetrics();
  return (
    <KpiCardView
      label="Total Resources"
      value={isDefined(data?.value) ? formatCompact(data.value) : null}
      prevValue={isDefined(data?.previousValue) ? formatCompact(data.previousValue) : undefined}
      changePct={data?.changePercent ?? null}
      isLoading={isLoading}
      isError={isError}
    />
  );
}
