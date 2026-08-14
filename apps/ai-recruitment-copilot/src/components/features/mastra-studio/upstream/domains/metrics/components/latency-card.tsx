import { EntityType } from "@mastra/core/observability";
import { OpenInTracesButton } from "@mastra/playground-ui/domains/metrics/components/card-action-buttons";
import { LatencyCardView } from "@mastra/playground-ui/domains/metrics/components/latency-card-view";
import type { LatencyTab } from "@mastra/playground-ui/domains/metrics/components/latency-card-view";
import { useDrilldown } from "@mastra/playground-ui/domains/metrics/hooks/use-drilldown";
import { useLatencyMetrics } from "@mastra/playground-ui/domains/metrics/hooks/use-latency-metrics";
import { useNavigate } from "@/components/features/mastra-studio/router/compat";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

const TAB_TO_ROOT_ENTITY: Record<LatencyTab, EntityType> = {
  agents: EntityType.AGENT,
  tools: EntityType.TOOL,
  workflows: EntityType.WORKFLOW_RUN,
};

export function LatencyCard() {
  const { data, isLoading, isError } = useLatencyMetrics();
  const { getTracesHref, getBucketTracesHref } = useDrilldown();
  const { Link } = useLinkComponent();
  const navigate = useNavigate();

  return (
    <LatencyCardView
      data={data}
      isLoading={isLoading}
      isError={isError}
      onPointClick={(tab, point) => {
        if (Number.isFinite(point.tsMs)) {
          void navigate(
            getBucketTracesHref({ rootEntityType: TAB_TO_ROOT_ENTITY[tab] }, point.tsMs, "1h"),
          );
        }
      }}
      actions={(tab: LatencyTab) => (
        <OpenInTracesButton
          href={getTracesHref({ rootEntityType: TAB_TO_ROOT_ENTITY[tab] })}
          LinkComponent={Link}
        />
      )}
    />
  );
}
