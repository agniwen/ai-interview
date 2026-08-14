import { EntityType } from "@mastra/core/observability";
import {
  OpenErrorsInLogsButton,
  OpenInTracesButton,
} from "@mastra/playground-ui/domains/metrics/components/card-action-buttons";
import { TracesVolumeCardView } from "@mastra/playground-ui/domains/metrics/components/traces-volume-card-view";
import type { VolumeTab } from "@mastra/playground-ui/domains/metrics/components/traces-volume-card-view";
import { useDrilldown } from "@mastra/playground-ui/domains/metrics/hooks/use-drilldown";
import { useTraceVolumeMetrics } from "@mastra/playground-ui/domains/metrics/hooks/use-trace-volume-metrics";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

const TAB_TO_ROOT_ENTITY: Record<VolumeTab, EntityType> = {
  agents: EntityType.AGENT,
  tools: EntityType.TOOL,
  workflows: EntityType.WORKFLOW_RUN,
};

export function TracesVolumeCard() {
  const { data, isLoading, isError } = useTraceVolumeMetrics();
  const { getTracesHref, getLogsHref } = useDrilldown();
  const { Link } = useLinkComponent();

  return (
    <TracesVolumeCardView
      data={data}
      isLoading={isLoading}
      isError={isError}
      LinkComponent={Link}
      getRowHref={(tab, row) =>
        getTracesHref({ entityName: row.name, rootEntityType: TAB_TO_ROOT_ENTITY[tab] })
      }
      getErrorSegmentHref={(tab, row) =>
        row.errors > 0
          ? getLogsHref({
              entityName: row.name,
              rootEntityType: TAB_TO_ROOT_ENTITY[tab],
              status: "error",
            })
          : undefined
      }
      actions={(tab: VolumeTab) => (
        <>
          <OpenInTracesButton
            href={getTracesHref({ rootEntityType: TAB_TO_ROOT_ENTITY[tab] })}
            LinkComponent={Link}
          />
          <OpenErrorsInLogsButton
            href={getLogsHref({ rootEntityType: TAB_TO_ROOT_ENTITY[tab], status: "error" })}
            LinkComponent={Link}
          />
        </>
      )}
    />
  );
}
