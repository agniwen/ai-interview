import {
  DataList as EntityList,
  DataListSkeleton as EntityListSkeleton,
} from "@mastra/playground-ui/components/DataList";
import { truncateString } from "@mastra/playground-ui/utils/truncate-string";
import { CheckIcon, FileInput, FileOutput } from "lucide-react";
import { useMemo } from "react";
import type { ProcessorInfo, ProcessorPhase } from "../../hooks/use-processors";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

const phaseKeys: ProcessorPhase[] = [
  "input",
  "inputStep",
  "outputStep",
  "outputStream",
  "outputResult",
];

export interface ProcessorsListProps {
  processors: Record<string, ProcessorInfo>;
  isLoading: boolean;
  search?: string;
}

export function ProcessorsList({ processors, isLoading, search = "" }: ProcessorsListProps) {
  const { paths, Link } = useLinkComponent();

  const processorData = useMemo(
    () => Object.values(processors ?? {}).filter((p) => p.phases && p.phases.length > 0),
    [processors],
  );

  const filteredData = useMemo(() => {
    const term = search.toLowerCase();
    return processorData.filter(
      (p) => p.id.toLowerCase().includes(term) || (p.name || "").toLowerCase().includes(term),
    );
  }, [processorData, search]);

  if (isLoading) {
    return <EntityListSkeleton columns="auto 1fr auto auto auto auto auto auto" />;
  }

  return (
    <EntityList columns="auto 1fr auto auto auto auto auto auto" variant="striped">
      <EntityList.Top>
        <EntityList.TopCell>名称</EntityList.TopCell>
        <EntityList.TopCell>描述</EntityList.TopCell>
        <EntityList.TopCellSmart
          long="输入"
          short="输入"
          tooltip="包含输入阶段"
          className="text-center"
        />
        <EntityList.TopCellSmart
          long="输入步骤"
          short={
            <>
              <FileInput /> 步骤
            </>
          }
          tooltip="包含输入步骤阶段"
          className="text-center"
        />
        <EntityList.TopCellSmart
          long="输出步骤"
          short={
            <>
              <FileOutput /> 步骤
            </>
          }
          tooltip="包含输出步骤阶段"
          className="text-center"
        />
        <EntityList.TopCellSmart
          long="输出流"
          short={
            <>
              <FileOutput /> 流
            </>
          }
          tooltip="包含输出流阶段"
          className="text-center"
        />
        <EntityList.TopCellSmart
          long="输出结果"
          short={
            <>
              <FileOutput /> 结果
            </>
          }
          tooltip="包含输出结果阶段"
          className="text-center"
        />
        <EntityList.TopCellSmart short="使用方" long="使用此项的智能体" className="text-center" />
      </EntityList.Top>

      {filteredData.length === 0 && search ? (
        <EntityList.NoMatch message="没有符合搜索条件的处理器" />
      ) : null}

      {filteredData.map((processor) => {
        const name = truncateString(processor.name || processor.id, 50);
        const description = truncateString(processor.description ?? "", 200);
        const agentsCount = processor.agentIds?.length ?? 0;
        const phaseSet = new Set(processor.phases || []);

        const linkTo = processor.isWorkflow
          ? `${paths.workflowLink(processor.id)}/graph`
          : paths.processorLink(processor.id);

        return (
          <EntityList.RowLink key={processor.id} to={linkTo} LinkComponent={Link}>
            <EntityList.NameCell>{name}</EntityList.NameCell>
            <EntityList.DescriptionCell>{description}</EntityList.DescriptionCell>
            {phaseKeys.map((key) => (
              <EntityList.TextCell key={key} className="text-center">
                {phaseSet.has(key) && <CheckIcon className="size-4 mx-auto" />}
              </EntityList.TextCell>
            ))}
            <EntityList.TextCell className="text-center">{agentsCount || ""}</EntityList.TextCell>
          </EntityList.RowLink>
        );
      })}
    </EntityList>
  );
}
