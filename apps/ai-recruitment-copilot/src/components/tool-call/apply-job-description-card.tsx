"use client";

import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { CheckIcon, TargetIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useJobDescriptionOptionsQuery } from "@/app/(auth)/w/[slug]/chat/_lib/use-job-description-options";

interface RecommendedInput {
  id: string;
  name: string;
  departmentName?: string | null;
  reason: string;
}

interface ApplyJobDescriptionInput {
  recommended: RecommendedInput;
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
  const { recommended } = candidate;
  return (
    typeof recommended === "object" &&
    recommended !== null &&
    typeof recommended.id === "string" &&
    recommended.id.length > 0 &&
    typeof recommended.name === "string"
  );
}

function isApplyJobDescriptionOutput(value: unknown): value is ApplyJobDescriptionOutput {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<ApplyJobDescriptionOutput>;
  return candidate.action === "confirm" || candidate.action === "ignore";
}

function formatJdLabel(name: string, departmentName: string | null | undefined): string {
  return departmentName ? `${departmentName} / ${name}` : name;
}

interface DropdownOption {
  id: string;
  name: string;
  departmentName: string | null;
}

function ResolvedView({
  output,
  jdOptions,
  recommended,
}: {
  output: ApplyJobDescriptionOutput;
  jdOptions: DropdownOption[] | undefined;
  recommended: RecommendedInput;
}) {
  if (output.action !== "confirm") {
    return (
      <div className="rounded-xs border border-border bg-muted/30 px-3 py-2 text-xs">
        <div className="text-muted-foreground">已忽略，未设置在招岗位。</div>
      </div>
    );
  }
  // 用户可能在确认前改过下拉 —— 以 output.jobDescriptionId 为准，从客户端 JD 缓存里
  // 取展示名；查不到才回退到 input 里的推荐项名字。
  // The user may have changed the dropdown before confirming — resolve the
  // display name from the cached JD list keyed by output.jobDescriptionId,
  // falling back to the recommendation only when the cache misses.
  const confirmedJd = jdOptions?.find((item) => item.id === output.jobDescriptionId) ?? null;
  const displayName = confirmedJd
    ? formatJdLabel(confirmedJd.name, confirmedJd.departmentName)
    : formatJdLabel(recommended.name, recommended.departmentName);
  return (
    <div className="rounded-xs border border-border bg-muted/30 px-3 py-2 text-xs">
      <div className="font-medium text-foreground">已设置为：{displayName}</div>
    </div>
  );
}

function ApprovalView({
  options,
  recommendedId,
  selectedId,
  onSelectedIdChange,
  toolCallId,
  onConfirm,
  onIgnore,
}: {
  options: DropdownOption[];
  recommendedId: string;
  selectedId: string;
  onSelectedIdChange: (id: string) => void;
  toolCallId: string;
  onConfirm: (toolCallId: string, jobDescriptionId: string) => void;
  onIgnore: (toolCallId: string) => void;
}) {
  return (
    <>
      <Select onValueChange={onSelectedIdChange} value={selectedId}>
        <SelectTrigger className="h-13! w-full">
          <SelectValue placeholder="选择一个在招岗位" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => {
            const isRecommended = option.id === recommendedId;
            return (
              <SelectItem key={option.id} value={option.id}>
                <div className="flex w-full flex-col items-start text-left">
                  <span className="flex items-center gap-2">
                    <span>{formatJdLabel(option.name, option.departmentName)}</span>
                    {isRecommended ? (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-[10px] text-primary">
                        推荐
                      </span>
                    ) : null}
                  </span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button onClick={() => onIgnore(toolCallId)} size="sm" type="button" variant="outline">
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
  );
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

  const partState = (part as { state?: string }).state;
  const hasOutput = output !== null;
  const isTerminalWithoutOutput = partState === "output-error";

  // 服务端只返回单一推荐；下拉里展示的全部岗位用客户端缓存里的 JD 列表渲染，
  // useJobDescriptionOptionsQuery 已经被外层 workspace 预热过，命中 60s staleTime。
  // Server only returns the single recommendation; the dropdown options come
  // from the already-cached JD list (warmed by the outer workspace, 60s
  // staleTime), so this hook usually resolves synchronously.
  const { data: jdOptions } = useJobDescriptionOptionsQuery();

  // 已确定的推荐 id —— 默认选中。如果用户没改，确认时就是它。
  // Recommended id from the server — default Select value.
  const recommendedId = input?.recommended.id ?? "";
  const [selectedId, setSelectedId] = useState<string>(recommendedId);

  // input 流式拼装期间 recommendedId 可能还是空字符串，第一次真正可用时回填。
  // 用户已经手动选过就不动它。
  // The recommended id may stream in late; promote it to selection once it's
  // available, but never clobber a user pick.
  useEffect(() => {
    if (recommendedId && !selectedId) {
      setSelectedId(recommendedId);
    }
  }, [recommendedId, selectedId]);

  // 下拉选项：优先用客户端 JD 列表；列表还没就绪时退化成只展示推荐这一个。
  // Prefer the full JD list; fall back to a single-item list (just the
  // recommendation) until the query resolves.
  const dropdownOptions = useMemo(() => {
    if (jdOptions && jdOptions.length > 0) {
      return jdOptions.map((item) => ({
        departmentName: item.departmentName ?? null,
        id: item.id,
        name: item.name,
      }));
    }
    if (input) {
      return [
        {
          departmentName: input.recommended.departmentName ?? null,
          id: input.recommended.id,
          name: input.recommended.name,
        },
      ];
    }
    return [];
  }, [jdOptions, input]);

  if (!input) {
    // 输入还在流式拼装，先 shimmer。
    // Input still streaming in — show shimmer.
    if (!hasOutput && !isTerminalWithoutOutput) {
      return (
        <div className="my-2 rounded border border-border/70 bg-background/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <TargetIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1 text-muted-foreground text-xs">
              <Shimmer duration={1.2}>正在生成岗位推荐…</Shimmer>
            </div>
          </div>
        </div>
      );
    }
    // 终态但 input 不可用：降级提示，不渲染整张卡片。
    // Terminal but input is unusable — degrade to a muted notice.
    return (
      <div className="my-2 rounded border border-border bg-muted/30 px-3 py-2 text-muted-foreground text-xs">
        岗位推荐数据缺失，跳过审批。
      </div>
    );
  }

  const isResolved = Boolean(output);
  const toolCallId = part.toolCallId ?? "";

  return (
    <div className="my-2 rounded border border-border/70 bg-background/60 px-4 py-3">
      <div className="flex items-start gap-2">
        <TargetIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="font-medium text-sm">
              {isResolved ? "在招岗位匹配结果" : "是否将以下在招岗位设置为本次对话上下文？"}
            </div>
            {!isResolved && input.recommended.reason ? (
              <div className="mt-1 text-muted-foreground text-xs leading-normal">
                推荐理由：{input.recommended.reason}
              </div>
            ) : null}
          </div>

          {output ? (
            <ResolvedView jdOptions={jdOptions} output={output} recommended={input.recommended} />
          ) : (
            <ApprovalView
              onConfirm={onConfirm}
              onIgnore={onIgnore}
              onSelectedIdChange={setSelectedId}
              options={dropdownOptions}
              recommendedId={recommendedId}
              selectedId={selectedId}
              toolCallId={toolCallId}
            />
          )}
        </div>
      </div>
    </div>
  );
}
