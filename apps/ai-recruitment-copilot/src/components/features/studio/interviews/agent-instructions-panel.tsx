"use client";

import { useQuery } from "@tanstack/react-query";
import { EyeIcon, FileTextIcon, Loader2Icon } from "@/components/icons/hugeicons";
import { useState } from "react";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { cn } from "@arc/shared/utils";

interface AgentInstructionVariant {
  interviewerName: string | null;
  instructions: string;
  openingPrompt: string;
  closingPrompt: string;
}

type ViewMode = "preview" | "raw";

// 提示词块的统一展示：preview 模式走 MarkdownView，raw 模式保留 <pre> 原样。
// 两种模式共用同一块容器样式，避免切换时高度跳变。
// Shared shell so toggling preview/raw doesn't shift layout.
const PROMPT_SHELL_CLASS =
  "rounded-md bg-background/60 p-3 text-muted-foreground text-sm leading-normal";

function PromptBlock({ content, mode }: { content: string; mode: ViewMode }) {
  if (mode === "raw") {
    return <pre className={cn(PROMPT_SHELL_CLASS, "whitespace-pre-wrap font-sans")}>{content}</pre>;
  }
  return <MarkdownView className={PROMPT_SHELL_CLASS} content={content} />;
}

export function AgentInstructionsPanel({
  recordId,
  enabled = true,
}: {
  recordId: string | null;
  /** Pause fetching when the parent panel/tab isn't visible. */
  enabled?: boolean;
}) {
  const slug = useWorkspaceSlug();
  const [mode, setMode] = useState<ViewMode>("preview");
  const { data: variants = [], isLoading } = useQuery({
    enabled: enabled && !!recordId,
    queryFn: async () => {
      const response = await rpc.api.w[":slug"].studio.interviews[":id"]["agent-instructions"].$get(
        {
          param: { id: recordId ?? "", slug },
        },
      );
      const payload = (await response.json()) as
        | { variants: AgentInstructionVariant[] }
        | { error?: string };
      if (!response.ok || !("variants" in payload)) {
        throw new Error(
          "error" in payload ? (payload.error ?? "加载提示词失败") : "加载提示词失败",
        );
      }
      return payload.variants;
    },
    queryKey: ["studio-interview-agent-instructions", slug, recordId],
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm">
        <Loader2Icon className="size-4 animate-spin" />
        正在生成提示词...
      </div>
    );
  }

  if (variants.length === 0) {
    return (
      <div className="py-10 text-center text-muted-foreground text-sm">暂无可生成的提示词。</div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <ToggleGroup
          aria-label="提示词显示模式"
          onValueChange={(value) => {
            // ToggleGroup type=single 允许空值（再次点击当前项），这里固定保留一项。
            // single ToggleGroup emits "" when user clicks the active item; keep
            // the current mode so the panel always has a rendered view.
            if (value === "preview" || value === "raw") {
              setMode(value);
            }
          }}
          size="sm"
          type="single"
          value={mode}
          variant="outline"
        >
          <ToggleGroupItem aria-label="Markdown 预览" value="preview">
            <EyeIcon className="size-3.5" />
            预览
          </ToggleGroupItem>
          <ToggleGroupItem aria-label="原文" value="raw">
            <FileTextIcon className="size-3.5" />
            原文
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {variants.map((variant, index) => (
        <div
          className="space-y-4 rounded-2xl border border-border bg-muted/30 p-4"
          key={variant.interviewerName ?? `variant-${index}`}
        >
          <h3 className="font-medium text-sm">
            {variant.interviewerName
              ? `面试官：${variant.interviewerName}`
              : "默认提示词（未关联岗位）"}
          </h3>

          <section className="space-y-2">
            <h4 className="font-medium text-foreground/80 text-xs uppercase tracking-wide">
              系统提示词 (system prompt)
            </h4>
            <PromptBlock content={variant.instructions} mode={mode} />
          </section>

          <section className="space-y-2">
            <h4 className="font-medium text-foreground/80 text-xs uppercase tracking-wide">
              开场白 prompt
            </h4>
            <PromptBlock content={variant.openingPrompt} mode={mode} />
          </section>

          <section className="space-y-2">
            <h4 className="font-medium text-foreground/80 text-xs uppercase tracking-wide">
              结束语 prompt
            </h4>
            <PromptBlock content={variant.closingPrompt} mode={mode} />
          </section>
        </div>
      ))}
    </div>
  );
}
