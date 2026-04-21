"use client";

import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { CheckIcon, TargetIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CandidateInput {
  id: string;
  name: string;
  departmentName?: string | null;
  reasons?: string;
  score?: number;
}

interface ApplyJobDescriptionInput {
  candidates: CandidateInput[];
  recommendedId: string;
  reasoning: string;
}

interface ApplyJobDescriptionOutput {
  action: "confirm" | "ignore";
  jobDescriptionId?: string;
}

type ApplyJobDescriptionPart = (ToolUIPart | DynamicToolUIPart) & {
  toolCallId?: string;
};

export interface ApplyJobDescriptionCardProps {
  part: ApplyJobDescriptionPart;
  onConfirm: (toolCallId: string, jobDescriptionId: string) => void;
  onIgnore: (toolCallId: string) => void;
}

function isApplyJobDescriptionInput(value: unknown): value is ApplyJobDescriptionInput {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<ApplyJobDescriptionInput>;
  return (
    Array.isArray(candidate.candidates) &&
    candidate.candidates.length > 0 &&
    typeof candidate.recommendedId === "string"
  );
}

function isApplyJobDescriptionOutput(value: unknown): value is ApplyJobDescriptionOutput {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<ApplyJobDescriptionOutput>;
  return candidate.action === "confirm" || candidate.action === "ignore";
}

export function ApplyJobDescriptionCard({
  part,
  onConfirm,
  onIgnore,
}: ApplyJobDescriptionCardProps) {
  const rawInput = (part as { input?: unknown }).input;
  const input = isApplyJobDescriptionInput(rawInput) ? rawInput : null;
  const rawOutput = (part as { output?: unknown }).output;
  const output = isApplyJobDescriptionOutput(rawOutput) ? rawOutput : null;

  const defaultSelectedId = useMemo(() => {
    if (!input) {
      return "";
    }
    const exists = input.candidates.some((candidate) => candidate.id === input.recommendedId);
    return exists ? input.recommendedId : (input.candidates[0]?.id ?? "");
  }, [input]);

  const [selectedId, setSelectedId] = useState<string>(defaultSelectedId);

  if (!input) {
    return (
      <div className="my-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-muted-foreground text-xs">
        岗位推荐数据缺失，跳过审批。
      </div>
    );
  }

  const currentSelection = input.candidates.find((candidate) => candidate.id === selectedId);
  const isResolved = Boolean(output);
  const isConfirmed = output?.action === "confirm";
  const confirmedCandidate = isConfirmed
    ? input.candidates.find((candidate) => candidate.id === output?.jobDescriptionId)
    : null;

  const toolCallId = part.toolCallId ?? "";

  return (
    <div className="my-2 rounded-xl border border-border/70 bg-background/60 px-4 py-3 shadow-sm">
      <div className="flex items-start gap-2">
        <TargetIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="font-medium text-sm">
              {isResolved ? "在招岗位匹配结果" : "是否将以下在招岗位设置为本次对话上下文？"}
            </div>
            {input.reasoning ? (
              <div className="mt-1 text-muted-foreground text-xs leading-relaxed">
                {input.reasoning}
              </div>
            ) : null}
          </div>

          {isResolved ? (
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
              {isConfirmed && confirmedCandidate ? (
                <div className="space-y-0.5">
                  <div className="font-medium text-foreground">
                    已设置为：
                    {confirmedCandidate.departmentName
                      ? `${confirmedCandidate.departmentName} / `
                      : ""}
                    {confirmedCandidate.name}
                  </div>
                  {confirmedCandidate.reasons ? (
                    <div className="text-muted-foreground">{confirmedCandidate.reasons}</div>
                  ) : null}
                </div>
              ) : (
                <div className="text-muted-foreground">已忽略，未设置在招岗位。</div>
              )}
            </div>
          ) : (
            <>
              <Select onValueChange={setSelectedId} value={selectedId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择一个在招岗位" />
                </SelectTrigger>
                <SelectContent>
                  {input.candidates.map((candidate) => {
                    const isRecommended = candidate.id === input.recommendedId;
                    return (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        <div className="flex w-full flex-col items-start text-left">
                          <span className="flex items-center gap-2">
                            <span>
                              {candidate.departmentName ? `${candidate.departmentName} / ` : ""}
                              {candidate.name}
                            </span>
                            {isRecommended ? (
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-[10px] text-primary">
                                推荐
                              </span>
                            ) : null}
                            {typeof candidate.score === "number" ? (
                              <span className="text-muted-foreground text-[10px]">
                                匹配度 {candidate.score}
                              </span>
                            ) : null}
                          </span>
                          {candidate.reasons ? (
                            <span className="line-clamp-1 text-muted-foreground text-xs">
                              {candidate.reasons}
                            </span>
                          ) : null}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              {currentSelection?.reasons ? (
                <div className="rounded-lg bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
                  {currentSelection.reasons}
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  onClick={() => onIgnore(toolCallId)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <XIcon className="size-3.5" />
                  忽略
                </Button>
                <Button
                  disabled={!selectedId}
                  onClick={() => onConfirm(toolCallId, selectedId)}
                  size="sm"
                  type="button"
                >
                  <CheckIcon className="size-3.5" />
                  确定
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
