import type { DatasetRecord } from "@mastra/client-js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@mastra/playground-ui/components/Dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@mastra/playground-ui/components/InputGroup";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { toast } from "@mastra/playground-ui/utils/toast";
import { SearchIcon } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { CreateDatasetDialog } from "@/components/features/mastra-studio/upstream/domains/datasets/components/create-dataset-dialog";
import {
  GenerateConfigDialog,
  GenerateReviewDialog,
} from "@/components/features/mastra-studio/upstream/domains/datasets/components/generate-items-dialog";
import type { useGenerationTasks } from "@/components/features/mastra-studio/upstream/domains/datasets/context/generation-context";
import type { useDatasetMutations } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-mutations";
import type { useScorers } from "@/components/features/mastra-studio/upstream/domains/scores/hooks/use-scorers";
import { parseIdList } from "./agent-playground-evaluate-helpers";

type Scorers = NonNullable<ReturnType<typeof useScorers>["data"]>;
type ScorerEntry = Scorers[string];

interface EvaluateDialogsProps {
  agentContext: { description: string; instructions: string; tools: string[] };
  agentId: string;
  attachDatasetSearch: string;
  attachScorer: (id: string, scorer: ScorerEntry) => Promise<void>;
  attachScorerSearch: string;
  generateDatasetId: string | null;
  generationTasks: ReturnType<typeof useGenerationTasks>["tasks"];
  reviewDatasetId: string | null;
  setAttachDatasetSearch: Dispatch<SetStateAction<string>>;
  setAttachScorerSearch: Dispatch<SetStateAction<string>>;
  setGenerateDatasetId: Dispatch<SetStateAction<string | null>>;
  setReviewDatasetId: Dispatch<SetStateAction<string | null>>;
  setShowAttachDialog: Dispatch<SetStateAction<boolean>>;
  setShowAttachScorerDialog: Dispatch<SetStateAction<boolean>>;
  setShowCreateDialog: Dispatch<SetStateAction<boolean>>;
  showAttachDialog: boolean;
  showAttachScorerDialog: boolean;
  showCreateDialog: boolean;
  unattachedDatasets: DatasetRecord[];
  unattachedScorers: [string, ScorerEntry][];
  updateDataset: ReturnType<typeof useDatasetMutations>["updateDataset"];
}

export function EvaluateDialogs({
  agentContext,
  agentId,
  attachDatasetSearch,
  attachScorer,
  attachScorerSearch,
  generateDatasetId,
  generationTasks,
  reviewDatasetId,
  setAttachDatasetSearch,
  setAttachScorerSearch,
  setGenerateDatasetId,
  setReviewDatasetId,
  setShowAttachDialog,
  setShowAttachScorerDialog,
  setShowCreateDialog,
  showAttachDialog,
  showAttachScorerDialog,
  showCreateDialog,
  unattachedDatasets,
  unattachedScorers,
  updateDataset,
}: EvaluateDialogsProps) {
  return (
    <>
      {/* Create Dataset Dialog */}
      <CreateDatasetDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        targetType="agent"
        targetIds={[agentId]}
      />

      {/* Generate Config Dialog */}
      {generateDatasetId && (
        <GenerateConfigDialog
          datasetId={generateDatasetId}
          agentContext={agentContext}
          onDismiss={() => setGenerateDatasetId(null)}
        />
      )}

      {/* Generate Review Dialog */}
      {reviewDatasetId &&
        generationTasks[reviewDatasetId]?.status === "review-ready" &&
        generationTasks[reviewDatasetId]?.items && (
          <GenerateReviewDialog
            datasetId={reviewDatasetId}
            items={generationTasks[reviewDatasetId].items}
            modelId={generationTasks[reviewDatasetId].modelId}
            onDismiss={() => setReviewDatasetId(null)}
          />
        )}

      {/* Attach Existing Dataset Dialog */}
      <Dialog open={showAttachDialog} onOpenChange={setShowAttachDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach Existing Dataset</DialogTitle>
          </DialogHeader>
          <DialogBody className="max-h-[50vh] overflow-y-auto">
            <InputGroup variant="outline">
              <InputGroupAddon align="inline-start">
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                aria-label="Search datasets"
                placeholder="Search datasets..."
                onChange={(event) => setAttachDatasetSearch(event.target.value)}
              />
            </InputGroup>
            {unattachedDatasets
              .filter(
                (ds) =>
                  !attachDatasetSearch ||
                  ds.name.toLowerCase().includes(attachDatasetSearch.toLowerCase()),
              )
              .map((ds) => (
                <button
                  key={ds.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-surface3 rounded-md transition-colors flex items-center justify-between"
                  onClick={async () => {
                    try {
                      await updateDataset.mutateAsync({
                        datasetId: ds.id,
                        targetIds: [...parseIdList(ds.targetIds), agentId],
                        // Classify legacy/untyped datasets without overwriting existing target types.
                        targetType: ds.targetType ?? "agent",
                      });
                      toast.success(`Dataset "${ds.name}" attached`);
                      setShowAttachDialog(false);
                    } catch {
                      toast.error("Failed to attach dataset");
                    }
                  }}
                >
                  <div>
                    <Txt variant="ui-sm" className="font-medium">
                      {ds.name}
                    </Txt>
                    {ds.description && (
                      <Txt variant="ui-xs" className="text-neutral3 block">
                        {ds.description}
                      </Txt>
                    )}
                  </div>
                </button>
              ))}
            {unattachedDatasets.filter(
              (ds) =>
                !attachDatasetSearch ||
                ds.name.toLowerCase().includes(attachDatasetSearch.toLowerCase()),
            ).length === 0 && (
              <Txt variant="ui-sm" className="text-neutral3 text-center py-4 block">
                No datasets available to attach
              </Txt>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Attach Existing Scorer Dialog */}
      <Dialog open={showAttachScorerDialog} onOpenChange={setShowAttachScorerDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach Existing Scorer</DialogTitle>
          </DialogHeader>
          <DialogBody className="max-h-[50vh] overflow-y-auto">
            <InputGroup variant="outline">
              <InputGroupAddon align="inline-start">
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                aria-label="Search scorers"
                placeholder="Search scorers..."
                onChange={(event) => setAttachScorerSearch(event.target.value)}
              />
            </InputGroup>
            {unattachedScorers
              .filter(([id, scorer]) => {
                if (!attachScorerSearch) {
                  return true;
                }
                const name = scorer.scorer?.name || id;
                return name.toLowerCase().includes(attachScorerSearch.toLowerCase());
              })
              .map(([id, scorer]) => (
                <button
                  key={id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-surface3 rounded-md transition-colors flex items-center justify-between"
                  onClick={async () => {
                    try {
                      await attachScorer(id, scorer);
                      toast.success(`Scorer "${scorer.scorer?.name || id}" attached`);
                      setShowAttachScorerDialog(false);
                    } catch {
                      toast.error("Failed to attach scorer");
                    }
                  }}
                >
                  <div>
                    <Txt variant="ui-sm" className="font-medium">
                      {scorer.scorer?.name || id}
                    </Txt>
                    {scorer.scorer?.description && (
                      <Txt variant="ui-xs" className="text-neutral3 block">
                        {scorer.scorer.description}
                      </Txt>
                    )}
                  </div>
                </button>
              ))}
            {unattachedScorers.filter(([id, scorer]) => {
              if (!attachScorerSearch) {
                return true;
              }
              const name = scorer.scorer?.name || id;
              return name.toLowerCase().includes(attachScorerSearch.toLowerCase());
            }).length === 0 && (
              <Txt variant="ui-sm" className="text-neutral3 text-center py-4 block">
                No scorers available to attach
              </Txt>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
