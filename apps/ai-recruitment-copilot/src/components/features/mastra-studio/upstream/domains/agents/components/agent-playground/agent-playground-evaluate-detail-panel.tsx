import type { DatasetRecord } from "@mastra/client-js";
import { Column } from "@mastra/playground-ui/components/Columns";
import type { Dispatch, SetStateAction } from "react";
import type { AgentExperiment } from "../../hooks/use-agent-experiments";
import type { AgentFormValues } from "../agent-edit-page/utils/form-validation";
import { DatasetDetailView } from "./dataset-detail-view";
import { ExperimentResultsPanel } from "./agent-playground-eval";
import { ScorerDetailView } from "./scorer-detail-view";
import { ScorerMiniEditor } from "./scorer-mini-editor";
import type { useScorers } from "@/components/features/mastra-studio/upstream/domains/scores/hooks/use-scorers";
import { parseIdList, renderBackButton } from "./agent-playground-evaluate-helpers";
import type { AgentEvalTab, DetailView } from "./agent-playground-evaluate-helpers";

type Scorers = NonNullable<ReturnType<typeof useScorers>["data"]>;

interface EvaluateDetailPanelProps {
  agentScorers: NonNullable<AgentFormValues["scorers"]>;
  agentId: string;
  allDatasets: DatasetRecord[];
  attachScorer: (scorerId: string, scorerData: unknown) => Promise<void>;
  datasetMap: Map<string, DatasetRecord>;
  detailView: DetailView;
  detachScorer: (scorerId: string) => Promise<void>;
  experiments: AgentExperiment[] | undefined;
  handleCreateScorerFromFailures: (items: { input: unknown; output: unknown }[]) => void;
  handleSendToReview: React.ComponentProps<typeof ExperimentResultsPanel>["onSendToReview"];
  scorers: Scorers | undefined;
  setActiveTab: Dispatch<SetStateAction<AgentEvalTab>>;
  setDetailView: Dispatch<SetStateAction<DetailView>>;
  setGenerateDatasetId: Dispatch<SetStateAction<string | null>>;
}

export function EvaluateDetailPanel({
  agentScorers,
  agentId,
  allDatasets,
  attachScorer,
  datasetMap,
  detailView,
  detachScorer,
  experiments,
  handleCreateScorerFromFailures,
  handleSendToReview,
  scorers,
  setActiveTab,
  setDetailView,
  setGenerateDatasetId,
}: EvaluateDetailPanelProps) {
  if (!detailView) {
    return null;
  }

  if (detailView.type === "dataset") {
    return (
      <Column withLeftSeparator>
        {renderBackButton("Back to Datasets", () => setDetailView(null))}
        <Column.Content>
          <DatasetDetailView
            agentId={agentId}
            datasetId={detailView.id}
            datasetName={datasetMap.get(detailView.id)?.name ?? ""}
            datasetDescription={datasetMap.get(detailView.id)?.description ?? undefined}
            datasetTags={datasetMap.get(detailView.id)?.tags ?? undefined}
            datasetTargetType={datasetMap.get(detailView.id)?.targetType}
            datasetTargetIds={parseIdList(datasetMap.get(detailView.id)?.targetIds)}
            activeScorers={Object.keys(agentScorers)}
            datasetScorerIds={datasetMap.get(detailView.id)?.scorerIds ?? null}
            onGenerate={() => setGenerateDatasetId(detailView.id)}
            onViewExperiment={(expId) =>
              setDetailView({ datasetId: detailView.id, id: expId, type: "experiment" })
            }
          />
        </Column.Content>
      </Column>
    );
  }

  if (detailView.type === "scorer") {
    return (
      <Column withLeftSeparator>
        {renderBackButton("Back to Scorers", () => setDetailView(null))}
        <Column.Content>
          <ScorerDetailView
            scorerId={detailView.id}
            scorerData={scorers?.[detailView.id]}
            isAttached={!!agentScorers[detailView.id]}
            onToggleAttach={async () => {
              await (agentScorers[detailView.id]
                ? detachScorer(detailView.id)
                : attachScorer(detailView.id, scorers?.[detailView.id] ?? {}));
            }}
            onEdit={() =>
              setDetailView({
                id: detailView.id,
                scorerData: scorers?.[detailView.id] ?? {},
                type: "edit-scorer",
              })
            }
            linkedDatasets={allDatasets.map((ds) => ({ id: ds.id, name: ds.name }))}
            onViewDataset={(dsId) => {
              setActiveTab("datasets");
              setDetailView({ id: dsId, type: "dataset" });
            }}
          />
        </Column.Content>
      </Column>
    );
  }

  if (detailView.type === "new-scorer") {
    return (
      <Column withLeftSeparator>
        {renderBackButton("Back to Scorers", () => setDetailView(null))}
        <Column.Content>
          <ScorerMiniEditor
            onBack={() => setDetailView(null)}
            prefillTestItems={detailView.prefillTestItems}
            onSaved={(scorerId: string) => {
              void attachScorer(scorerId, {});
              setDetailView({ id: scorerId, type: "scorer" });
            }}
          />
        </Column.Content>
      </Column>
    );
  }

  if (detailView.type === "edit-scorer") {
    return (
      <Column withLeftSeparator>
        {renderBackButton("Back to Scorer", () =>
          setDetailView({ id: detailView.id, type: "scorer" }),
        )}
        <Column.Content>
          <ScorerMiniEditor
            onBack={() => setDetailView({ id: detailView.id, type: "scorer" })}
            editScorerId={detailView.id}
            editScorerData={detailView.scorerData}
            onSaved={() => setDetailView({ id: detailView.id, type: "scorer" })}
          />
        </Column.Content>
      </Column>
    );
  }

  if (detailView.type === "experiment") {
    const exp = experiments?.find((e) => e.id === detailView.id);
    if (!exp) {
      return (
        <Column withLeftSeparator>
          {renderBackButton("Back to Experiments", () => setDetailView(null))}
          <Column.Content>
            <div className="p-4 text-neutral3">Experiment not found</div>
          </Column.Content>
        </Column>
      );
    }
    return (
      <Column withLeftSeparator>
        {renderBackButton("Back to Experiments", () => setDetailView(null))}
        <Column.Content>
          <ExperimentResultsPanel
            experiment={exp}
            onBack={() => setDetailView(null)}
            onSendToReview={handleSendToReview}
            onCreateScorer={handleCreateScorerFromFailures}
          />
        </Column.Content>
      </Column>
    );
  }

  return null;
}
