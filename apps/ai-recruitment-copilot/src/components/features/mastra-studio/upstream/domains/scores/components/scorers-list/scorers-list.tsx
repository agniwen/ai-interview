import type { GetScorerResponse } from "@mastra/client-js";
import { Chip } from "@mastra/playground-ui/components/Chip";
import {
  DataList as EntityList,
  DataListSkeleton as EntityListSkeleton,
} from "@mastra/playground-ui/components/DataList";
import { AgentIcon } from "@mastra/playground-ui/icons/AgentIcon";
import { WorkflowIcon } from "lucide-react";
import { useMemo } from "react";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";
import { SCORER_SOURCE_OPTIONS } from "./constants";

export interface ScorersListProps {
  scorers: Record<string, GetScorerResponse>;
  isLoading: boolean;
  search?: string;
  sourceFilter?: string;
}

const COLUMNS = "minmax(0,1fr) minmax(0,1.5fr) auto auto auto";

export function ScorersList({
  scorers,
  isLoading,
  search = "",
  sourceFilter = "all",
}: ScorersListProps) {
  const { paths, Link } = useLinkComponent();

  const scorerData = useMemo(
    () =>
      Object.entries(scorers).map(([key, scorer]) => ({
        ...scorer,
        id: key,
      })),
    [scorers],
  );

  const filteredData = useMemo(() => {
    const term = search.toLowerCase();
    return scorerData.filter((s) => {
      const matchesSearch =
        !term ||
        s.scorer.config?.id?.toLowerCase().includes(term) ||
        s.scorer.config?.name?.toLowerCase().includes(term);
      const matchesSource = sourceFilter === "all" || s.source === sourceFilter;
      return matchesSearch && matchesSource;
    });
  }, [scorerData, search, sourceFilter]);

  if (isLoading) {
    return <EntityListSkeleton columns={COLUMNS} />;
  }

  return (
    <EntityList columns={COLUMNS} variant="striped">
      <EntityList.Top>
        <EntityList.TopCell>名称</EntityList.TopCell>
        <EntityList.TopCell>描述</EntityList.TopCell>
        <EntityList.TopCell>来源</EntityList.TopCell>
        <EntityList.TopCellSmart
          long="智能体"
          short={<AgentIcon />}
          tooltip="关联智能体数量"
          className="text-center"
        />
        <EntityList.TopCellSmart
          long="工作流"
          short={<WorkflowIcon />}
          tooltip="关联工作流数量"
          className="text-center"
        />
      </EntityList.Top>

      {filteredData.map((scorer) => {
        const name = scorer.scorer.config?.name || scorer.id;
        const description = scorer.scorer.config?.description || "";
        const agentCount = scorer.agentIds?.length ?? 0;
        const workflowCount = scorer.workflowIds?.length ?? 0;
        const isTrajectory = scorer.scorer.config?.type === "trajectory";
        const sourceLabel =
          SCORER_SOURCE_OPTIONS.find((option) => option.value === scorer.source)?.label ??
          scorer.source;

        return (
          <EntityList.RowLink key={scorer.id} to={paths.scorerLink(scorer.id)} LinkComponent={Link}>
            <EntityList.NameCell>
              <span className="flex min-w-0 max-w-full items-center gap-1.5">
                <span className="min-w-0 truncate">{name}</span>
                {isTrajectory && (
                  <Chip size="small" color="purple" className="shrink-0">
                    轨迹
                  </Chip>
                )}
              </span>
            </EntityList.NameCell>
            <EntityList.DescriptionCell>{description}</EntityList.DescriptionCell>
            <EntityList.Cell className="py-0">
              <Chip size="small" color={scorer.source === "code" ? "blue" : "gray"}>
                {sourceLabel}
              </Chip>
            </EntityList.Cell>
            <EntityList.TextCell className="text-center">{agentCount || ""}</EntityList.TextCell>
            <EntityList.TextCell className="text-center">{workflowCount || ""}</EntityList.TextCell>
          </EntityList.RowLink>
        );
      })}
    </EntityList>
  );
}
