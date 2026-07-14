import { Button } from "@mastra/playground-ui/components/Button";
import { Checkbox } from "@mastra/playground-ui/components/Checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@mastra/playground-ui/components/Dialog";
import { Label } from "@mastra/playground-ui/components/Label";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Textarea } from "@mastra/playground-ui/components/Textarea";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { cn } from "@mastra/playground-ui/utils/cn";
import type { ReviewItem } from "./review-item-card";
import { ProposalTag } from "./proposal-tag";
import { LLMModels } from "@/components/features/mastra-studio/upstream/domains/llm/components/llm-models";
import { LLMProviders } from "@/components/features/mastra-studio/upstream/domains/llm/components/llm-providers";

export interface ProposalAssignment {
  accepted: boolean;
  itemId: string;
  reason: string;
  tags: string[];
}

export function AnalyzeItemsDialog({
  analyzing,
  model,
  onAnalyze,
  onModelChange,
  onOpenChange,
  onPromptChange,
  onProviderChange,
  open,
  prompt,
  provider,
  selectedCount,
}: {
  analyzing: boolean;
  model: string;
  onAnalyze: () => void;
  onModelChange: (model: string) => void;
  onOpenChange: (open: boolean) => void;
  onPromptChange: (prompt: string) => void;
  onProviderChange: (provider: string) => void;
  open: boolean;
  prompt: string;
  provider: string;
  selectedCount: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Analyze Items</DialogTitle>
          <DialogDescription>
            Use an LLM to automatically suggest tags for the selected items.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs mb-1 block">Provider</Label>
              <LLMProviders value={provider} onValueChange={onProviderChange} />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Model</Label>
              <LLMModels llmId={provider} value={model} onValueChange={onModelChange} />
            </div>
          </div>
          <Txt variant="ui-xs" className="text-neutral3">
            {selectedCount} item{selectedCount === 1 ? "" : "s"} will be analyzed
          </Txt>
          <div>
            <Label className="text-xs">Instructions (optional)</Label>
            <Textarea
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder="E.g., Focus on safety issues and factual errors..."
              rows={3}
              className="text-xs mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onAnalyze} disabled={!provider || !model || analyzing}>
            {analyzing && <Spinner className="w-4 h-4 mr-1" />}
            Analyze
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getItemPreview(item: ReviewItem | undefined, itemId: string): string {
  if (!item) {
    return itemId;
  }
  return typeof item.input === "string"
    ? item.input.slice(0, 100)
    : JSON.stringify(item.input).slice(0, 100);
}

export function ProposedTagsDialog({
  assignments,
  items,
  onAccept,
  onAssignmentsChange,
  onOpenChange,
  open,
}: {
  assignments: ProposalAssignment[];
  items: ReviewItem[];
  onAccept: () => void;
  onAssignmentsChange: (assignments: ProposalAssignment[]) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const acceptedCount = assignments.filter((proposal) => proposal.accepted).length;
  const updateAssignment = (
    index: number,
    update: (item: ProposalAssignment) => ProposalAssignment,
  ) => {
    onAssignmentsChange(
      assignments.map((proposal, current) => (current === index ? update(proposal) : proposal)),
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Proposed Tags</DialogTitle>
          <DialogDescription>
            {acceptedCount} of {assignments.length} proposals selected
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {assignments.map((proposal, index) => {
            const item = items.find((candidate) => candidate.id === proposal.itemId);
            return (
              <div
                key={proposal.itemId}
                className={cn("p-3 border rounded-lg", !proposal.accepted && "opacity-50")}
              >
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={proposal.accepted}
                    onCheckedChange={(checked) =>
                      updateAssignment(index, (current) => ({
                        ...current,
                        accepted: Boolean(checked),
                      }))
                    }
                  />
                  <div className="flex-1 min-w-0">
                    <Txt variant="ui-xs" className="text-neutral4 truncate block">
                      {getItemPreview(item, proposal.itemId)}
                    </Txt>
                    <div className="flex gap-1 flex-wrap mt-1.5">
                      {proposal.tags.map((tag, tagIndex) => (
                        <ProposalTag
                          key={`${tag}-${tagIndex}`}
                          tag={tag}
                          onRename={(newTag) =>
                            updateAssignment(index, (current) => ({
                              ...current,
                              tags: current.tags.map((value, currentIndex) =>
                                currentIndex === tagIndex ? newTag : value,
                              ),
                            }))
                          }
                          onRemove={() =>
                            updateAssignment(index, (current) => ({
                              ...current,
                              tags: current.tags.filter(
                                (_, currentIndex) => currentIndex !== tagIndex,
                              ),
                            }))
                          }
                        />
                      ))}
                    </div>
                    {proposal.reason && (
                      <Txt variant="ui-xs" className="text-neutral3 mt-1 block italic">
                        {proposal.reason}
                      </Txt>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onAccept} disabled={acceptedCount === 0}>
            Accept {acceptedCount} proposals
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
