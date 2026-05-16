"use client";

import { useQuery } from "@tanstack/react-query";
import { EyeIcon, FileTextIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import Markdown from "react-markdown";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { cn } from "@/lib/shared/utils";

interface AgentInstructionVariant {
  interviewerName: string | null;
  instructions: string;
  openingPrompt: string;
  closingPrompt: string;
}

type ViewMode = "preview" | "raw";

// 提示词块的统一展示：preview 模式走 react-markdown 渲染，raw 模式保留 <pre> 原样。
// 两种模式共用同一块容器样式，避免切换时高度跳变。
//
// Shared block renderer for prompt sections — preview pipes through
// react-markdown, raw keeps the verbatim <pre>. Both share the same shell so
// toggling view modes doesn't shift layout.
// markdown 节点的最小排版补丁。项目没装 @tailwindcss/typography，所以这里直接
// 给 Markdown 的子元素加间距、列表项符号、heading 字号等基础规则。
// Minimal typographic rules for the rendered markdown — the project doesn't
// ship @tailwindcss/typography, so we style direct children inline instead of
// relying on `prose`.
const MARKDOWN_BODY_CLASS = cn(
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_p]:my-2 [&_p]:leading-relaxed",
  "[&_h1]:mt-3 [&_h1]:mb-2 [&_h1]:font-medium [&_h1]:text-base [&_h1]:text-foreground",
  "[&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:font-medium [&_h2]:text-sm [&_h2]:text-foreground",
  "[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:font-medium [&_h3]:text-sm [&_h3]:text-foreground",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-0.5",
  "[&_strong]:font-medium [&_strong]:text-foreground",
  "[&_em]:italic",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-foreground",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline",
);

function PromptBlock({ content, mode }: { content: string; mode: ViewMode }) {
  const shellClass = "rounded-md bg-background/60 p-3 text-muted-foreground text-sm leading-normal";
  if (mode === "raw") {
    return <pre className={cn(shellClass, "whitespace-pre-wrap font-sans")}>{content}</pre>;
  }
  return (
    <div className={cn(shellClass, MARKDOWN_BODY_CLASS)}>
      <Markdown>{content}</Markdown>
    </div>
  );
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
          className="space-y-4 rounded-2xl border border-border/60 bg-muted/30 p-4"
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
