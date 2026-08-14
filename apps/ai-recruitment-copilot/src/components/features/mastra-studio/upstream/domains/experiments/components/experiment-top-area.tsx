import type { DatasetExperiment } from "@mastra/client-js";
import { DataKeysAndValues } from "@mastra/playground-ui/components/DataKeysAndValues";
import { PageLayout } from "@mastra/playground-ui/components/PageLayout";
import { format } from "date-fns";
import { useAgents } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-agents";
import { ExperimentStats } from "@/components/features/mastra-studio/upstream/domains/experiments/components/experiment-stats";
import { useScorers } from "@/components/features/mastra-studio/upstream/domains/scores/hooks/use-scorers";
import { useWorkflows } from "@/components/features/mastra-studio/upstream/domains/workflows/hooks/use-workflows";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

export interface ExperimentTopAreaProps {
  experiment: DatasetExperiment;
}

/**
 * Top area for any Experiment page — keys-and-values (Created/Completed/Target/Version)
 * on the left, stats on the right. Wrapped in PageLayout primitives so it slots into
 * any consumer's PageLayout shell.
 */
export function ExperimentTopArea({ experiment }: ExperimentTopAreaProps) {
  const { Link: LinkComponent, paths } = useLinkComponent();
  const { data: agents } = useAgents();
  const { data: workflows } = useWorkflows();
  const { data: scorers } = useScorers();

  const targetPath = () => {
    switch (experiment.targetType) {
      case "agent": {
        return paths.agentLink(experiment.targetId);
      }
      case "workflow": {
        return paths.workflowLink(experiment.targetId);
      }
      case "scorer": {
        return paths.scorerLink(experiment.targetId);
      }
      default: {
        return "#";
      }
    }
  };

  const targetName = () => {
    const { targetId } = experiment;
    if (!targetId) {
      return targetId;
    }
    switch (experiment.targetType) {
      case "agent": {
        return agents?.[targetId]?.name ?? targetId;
      }
      case "workflow": {
        return workflows?.[targetId]?.name ?? targetId;
      }
      case "scorer": {
        return scorers?.[targetId]?.scorer?.config?.name ?? targetId;
      }
      default: {
        return targetId;
      }
    }
  };

  const versionLinkHref =
    experiment.agentVersion && experiment.targetType === "agent" && experiment.targetId
      ? `${paths.agentLink(experiment.targetId)}/editor?version=${encodeURIComponent(experiment.agentVersion)}`
      : null;

  return (
    <PageLayout.TopArea>
      <PageLayout.Row>
        <PageLayout.Column>
          <DataKeysAndValues numOfCol={2}>
            <DataKeysAndValues.Key>创建时间</DataKeysAndValues.Key>
            <DataKeysAndValues.Value>
              {format(new Date(experiment.createdAt), "yyyy/MM/dd HH:mm")}
            </DataKeysAndValues.Value>
            {experiment.completedAt && (
              <>
                <DataKeysAndValues.Key>完成时间</DataKeysAndValues.Key>
                <DataKeysAndValues.Value>
                  {format(new Date(experiment.completedAt), "yyyy/MM/dd HH:mm")}
                </DataKeysAndValues.Value>
              </>
            )}
            <DataKeysAndValues.Key>目标</DataKeysAndValues.Key>
            <DataKeysAndValues.ValueLink href={targetPath()} as={LinkComponent}>
              {targetName()}
            </DataKeysAndValues.ValueLink>
            {experiment.agentVersion && (
              <>
                <DataKeysAndValues.Key>版本</DataKeysAndValues.Key>
                {versionLinkHref ? (
                  <DataKeysAndValues.ValueLink href={versionLinkHref} as={LinkComponent}>
                    {experiment.agentVersion}
                  </DataKeysAndValues.ValueLink>
                ) : (
                  <DataKeysAndValues.Value>{experiment.agentVersion}</DataKeysAndValues.Value>
                )}
              </>
            )}
          </DataKeysAndValues>
        </PageLayout.Column>
        <PageLayout.Column>
          <ExperimentStats experiment={experiment} />
        </PageLayout.Column>
      </PageLayout.Row>
    </PageLayout.TopArea>
  );
}
