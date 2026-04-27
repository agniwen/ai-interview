"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";

interface AgentInstructionVariant {
  interviewerName: string | null;
  instructions: string;
}

export function AgentInstructionsPanel({
  recordId,
  enabled = true,
}: {
  recordId: string | null;
  /** Pause fetching when the parent panel/tab isn't visible. */
  enabled?: boolean;
}) {
  const { data: variants = [], isLoading } = useQuery({
    enabled: enabled && !!recordId,
    queryFn: async () => {
      const response = await fetch(`/api/studio/interviews/${recordId}/agent-instructions`);
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
    queryKey: ["studio-interview-agent-instructions", recordId],
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
      {variants.map((variant, index) => (
        <div
          className="rounded-2xl border border-border/60 bg-muted/30 p-4"
          key={variant.interviewerName ?? `variant-${index}`}
        >
          <h3 className="mb-3 font-medium text-sm">
            {variant.interviewerName
              ? `面试官：${variant.interviewerName}`
              : "默认提示词（未关联岗位）"}
          </h3>
          <pre className="whitespace-pre-wrap font-sans text-muted-foreground text-sm leading-relaxed">
            {variant.instructions}
          </pre>
        </div>
      ))}
    </div>
  );
}
