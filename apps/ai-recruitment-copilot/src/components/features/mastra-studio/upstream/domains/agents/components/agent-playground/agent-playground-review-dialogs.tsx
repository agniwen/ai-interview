import { Button } from "@mastra/playground-ui/components/Button";
import { Checkbox } from "@mastra/playground-ui/components/Checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@mastra/playground-ui/components/Dialog";
import { Label } from "@mastra/playground-ui/components/Label";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Textarea } from "@mastra/playground-ui/components/Textarea";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { cn } from "@mastra/playground-ui/utils/cn";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { LLMModels } from "@/components/features/mastra-studio/upstream/domains/llm/components/llm-models";
import { LLMProviders } from "@/components/features/mastra-studio/upstream/domains/llm/components/llm-providers";
import { cleanProviderId } from "@/components/features/mastra-studio/upstream/domains/llm/utils";
import { ProposalTag } from "@/components/features/mastra-studio/upstream/domains/review/components";
import type { useReviewQueue } from "../../context/review-queue-context";
import { resolveConditional } from "../../utils/conditional";
import { isTruthy } from "../../utils/truthiness";
import { stringifyValue } from "./agent-playground-review-helpers";

type ReviewItem = ReturnType<typeof useReviewQueue>["items"][number];

interface ProposedAssignment {
  itemId: string;
  tags: string[];
  reason: string;
  accepted: boolean;
}

interface ReviewDialogsProps {
  analysisModelId: string | null;
  analyzeContentRef: RefObject<HTMLDivElement | null>;
  analyzeMode: "untagged" | "selected";
  analyzeModel: string;
  analyzePrompt: string;
  analyzeProvider: string;
  handleAcceptProposals: () => void;
  handleAnalyze: () => Promise<void>;
  isAnalyzing: boolean;
  items: ReviewItem[];
  proposedAssignments: ProposedAssignment[];
  selectedItemCount: number;
  setAnalyzeModel: Dispatch<SetStateAction<string>>;
  setAnalyzePrompt: Dispatch<SetStateAction<string>>;
  setAnalyzeProvider: Dispatch<SetStateAction<string>>;
  setProposedAssignments: Dispatch<SetStateAction<ProposedAssignment[]>>;
  setShowAnalyzeDialog: Dispatch<SetStateAction<boolean>>;
  setShowProposalDialog: Dispatch<SetStateAction<boolean>>;
  showAnalyzeDialog: boolean;
  showProposalDialog: boolean;
  untaggedCount: number;
}

export function ReviewDialogs({
  analysisModelId,
  analyzeContentRef,
  analyzeMode,
  analyzeModel,
  analyzePrompt,
  analyzeProvider,
  handleAcceptProposals,
  handleAnalyze,
  isAnalyzing,
  items,
  proposedAssignments,
  selectedItemCount,
  setAnalyzeModel,
  setAnalyzePrompt,
  setAnalyzeProvider,
  setProposedAssignments,
  setShowAnalyzeDialog,
  setShowProposalDialog,
  showAnalyzeDialog,
  showProposalDialog,
  untaggedCount,
}: ReviewDialogsProps) {
  return (
    <>
      {/* Analyze configuration dialog */}
      <Dialog open={showAnalyzeDialog} onOpenChange={setShowAnalyzeDialog}>
        <DialogContent ref={analyzeContentRef} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Analyze {analyzeMode === "untagged" ? "Untagged" : "Selected"} Items
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Model</Label>
                <div className="flex items-center gap-1.5">
                  <div className="w-[160px]">
                    <LLMProviders
                      value={analyzeProvider}
                      onValueChange={(value) => {
                        const cleaned = cleanProviderId(value);
                        setAnalyzeProvider(cleaned);
                        setAnalyzeModel("");
                      }}
                      size="sm"
                      container={analyzeContentRef}
                    />
                  </div>
                  <div className="flex-1">
                    <LLMModels
                      llmId={analyzeProvider}
                      value={analyzeModel}
                      onValueChange={setAnalyzeModel}
                      size="sm"
                      container={analyzeContentRef}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Items</Label>
                <Txt variant="ui-sm" className="text-neutral4">
                  {analyzeMode === "untagged"
                    ? `${untaggedCount} untagged item${isTruthy(untaggedCount !== 1) ? "s" : ""}`
                    : `${selectedItemCount} selected item${isTruthy(selectedItemCount !== 1) ? "s" : ""}`}
                </Txt>
              </div>

              <div className="space-y-1">
                <Label>Instructions (optional)</Label>
                <Textarea
                  value={analyzePrompt}
                  onChange={(e) => setAnalyzePrompt(e.target.value)}
                  placeholder="e.g., Focus on tool usage failures, pay attention to whether the agent hallucinated..."
                  rows={3}
                  disabled={isAnalyzing}
                />
                <Txt variant="ui-xs" className="text-neutral2">
                  Guide the LLM on what to look for when tagging items
                </Txt>
              </div>
            </div>
          </DialogBody>
          <DialogFooter className="px-6">
            <Button
              variant="ghost"
              onClick={() => setShowAnalyzeDialog(false)}
              disabled={isAnalyzing}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleAnalyze}
              disabled={resolveConditional(
                isAnalyzing || !analyzeProvider,
                (conditionValue) => conditionValue,
                () => !analyzeModel,
              )}
            >
              {isAnalyzing ? (
                <>
                  <Spinner className="mr-2" />
                  Analyzing...
                </>
              ) : (
                "Analyze"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Proposal confirmation dialog */}
      <Dialog open={showProposalDialog} onOpenChange={setShowProposalDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Proposed Tag Assignments</DialogTitle>
            {resolveConditional(
              analysisModelId,
              (conditionValue) => (
                <Txt variant="ui-xs" className="text-neutral3 mt-1">
                  Analyzed by <span className="font-medium text-neutral4">{conditionValue}</span>
                </Txt>
              ),
              () => null,
            )}
          </DialogHeader>
          <DialogBody className="max-h-[400px] overflow-y-auto space-y-2">
            {proposedAssignments.map((proposal, idx) => {
              const item = items.find((i) => i.id === proposal.itemId);
              const inputStr = stringifyValue(item?.input) ?? "";
              return (
                <div
                  key={proposal.itemId}
                  className={cn(
                    "flex items-start gap-2 p-2 rounded-md border border-border1",
                    proposal.accepted ? "bg-surface1" : "bg-surface1 opacity-50",
                  )}
                >
                  <Checkbox
                    checked={proposal.accepted}
                    onCheckedChange={(checked) => {
                      setProposedAssignments((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, accepted: !!checked } : p)),
                      );
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <Txt variant="ui-xs" className="text-neutral4 truncate block">
                      {inputStr || `Item ${proposal.itemId.slice(0, 8)}`}
                    </Txt>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {proposal.tags.map((tag, tagIdx) => (
                        <ProposalTag
                          key={`${tag}-${tagIdx}`}
                          tag={tag}
                          onRename={(newTag) =>
                            setProposedAssignments((prev) =>
                              prev.map((p, i) =>
                                i === idx
                                  ? {
                                      ...p,
                                      tags: p.tags.map((t, j) => (j === tagIdx ? newTag : t)),
                                    }
                                  : p,
                              ),
                            )
                          }
                          onRemove={() =>
                            setProposedAssignments((prev) =>
                              prev.map((p, i) =>
                                i === idx
                                  ? { ...p, tags: p.tags.filter((_, j) => j !== tagIdx) }
                                  : p,
                              ),
                            )
                          }
                        />
                      ))}
                    </div>
                    {proposal.reason && (
                      <Txt variant="ui-xs" className="text-neutral3 mt-1 italic">
                        {proposal.reason}
                      </Txt>
                    )}
                  </div>
                </div>
              );
            })}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowProposalDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleAcceptProposals}
              disabled={proposedAssignments.filter((p) => p.accepted).length === 0}
            >
              Accept {proposedAssignments.filter((p) => p.accepted).length} proposals
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
