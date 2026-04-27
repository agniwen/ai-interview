"use client";

import type {
  InterviewQuestionTemplateDifficulty,
  InterviewQuestionTemplateRecord,
} from "@/lib/interview-question-templates";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListChecksIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

const DIFFICULTY_LABEL: Record<InterviewQuestionTemplateDifficulty, string> = {
  easy: "简单",
  hard: "困难",
  medium: "中等",
};

const DIFFICULTY_PILL: Record<InterviewQuestionTemplateDifficulty, string> = {
  easy: "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  hard: "border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  medium: "border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

interface BindingsResponse {
  applicable: InterviewQuestionTemplateRecord[];
  bindings: {
    templateId: string;
    versionId: string;
    version: number;
    disabledByUser: boolean;
  }[];
}

async function fetchBindings(interviewId: string): Promise<BindingsResponse> {
  const response = await fetch(`/api/studio/interviews/${interviewId}/question-template-bindings`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error ?? "加载面试题绑定失败");
  }
  return payload as BindingsResponse;
}

async function updateBindings(
  interviewId: string,
  enabledTemplateIds: string[],
): Promise<BindingsResponse> {
  const response = await fetch(`/api/studio/interviews/${interviewId}/question-template-bindings`, {
    body: JSON.stringify({ enabledTemplateIds }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error ?? "更新失败");
  }
  return payload as BindingsResponse;
}

export function InterviewQuestionBindingsSection({
  interviewId,
  disabled = false,
}: {
  interviewId: string;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["interview-question-bindings", interviewId] as const;
  const { data, isLoading, isError } = useQuery({
    queryFn: () => fetchBindings(interviewId),
    queryKey,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });

  // Local "in-flight" state lets the user click multiple switches in quick
  // succession without each click waiting on a network round-trip.
  const [pendingEnabled, setPendingEnabled] = useState<Set<string> | null>(null);

  const enabledIds = useMemo(() => {
    if (pendingEnabled) {
      return pendingEnabled;
    }
    if (!data) {
      return new Set<string>();
    }
    const set = new Set<string>();
    const boundMap = new Map(data.bindings.map((b) => [b.templateId, b]));
    for (const template of data.applicable) {
      const binding = boundMap.get(template.id);
      // Default-on for templates that are applicable AND either bound-and-enabled
      // OR not yet bound (which is the auto-create-on-next-save behavior).
      if (!binding || !binding.disabledByUser) {
        set.add(template.id);
      }
    }
    return set;
  }, [data, pendingEnabled]);

  const mutation = useMutation({
    mutationFn: (enabled: string[]) => updateBindings(interviewId, enabled),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "更新失败");
      setPendingEnabled(null);
      void queryClient.invalidateQueries({ queryKey });
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
      // The agent-instructions preview is built from the same `disabledByUser`
      // flags we just toggled — invalidate it so the Agent 提示词 tab picks up
      // the change next time it renders.
      void queryClient.invalidateQueries({
        queryKey: ["studio-interview-agent-instructions", interviewId],
      });
      setPendingEnabled(null);
    },
  });

  // Keep the optimistic set in sync if the source data changes underneath.
  useEffect(() => {
    if (!mutation.isPending) {
      setPendingEnabled(null);
    }
  }, [mutation.isPending]);

  function toggle(templateId: string, next: boolean) {
    if (disabled || mutation.isPending) {
      return;
    }
    const nextSet = new Set(enabledIds);
    if (next) {
      nextSet.add(templateId);
    } else {
      nextSet.delete(templateId);
    }
    setPendingEnabled(nextSet);
    mutation.mutate([...nextSet]);
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="font-medium text-sm">面试题</p>
        <p className="mt-1 text-muted-foreground text-xs">
          AI
          面试官会按顺序必问下列已开启的面试题；面试创建瞬间的题目内容已被冻结为快照，之后编辑不影响本面试。
        </p>
      </div>

      {isLoading ? (
        <p className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center text-muted-foreground text-sm">
          正在加载…
        </p>
      ) : null}
      {isError ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-6 text-center text-destructive text-sm">
          加载失败，请刷新重试。
        </p>
      ) : null}
      {!isLoading && !isError && data && data.applicable.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center text-muted-foreground text-sm">
          没有适用的面试题（全局或当前岗位绑定）。
        </p>
      ) : null}
      {!isLoading && !isError && data && data.applicable.length > 0 ? (
        <div className="space-y-3">
          {data.applicable.map((template) => {
            const isEnabled = enabledIds.has(template.id);
            return (
              <div
                className={`overflow-hidden rounded-xl border bg-muted/20 transition-opacity ${
                  isEnabled ? "border-border/60" : "border-border/40 opacity-60"
                }`}
                key={template.id}
              >
                <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 items-start gap-3">
                    <ListChecksIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-sm">{template.title}</p>
                        <Badge variant={template.scope === "global" ? "default" : "secondary"}>
                          {template.scope === "global" ? "全局" : "岗位绑定"}
                        </Badge>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {template.questions.length} 题
                        </span>
                      </div>
                      {template.description ? (
                        <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
                          {template.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <Switch
                    aria-label={isEnabled ? "已开启" : "已关闭"}
                    checked={isEnabled}
                    disabled={disabled || mutation.isPending}
                    onCheckedChange={(checked) => toggle(template.id, checked)}
                  />
                </div>

                {template.questions.length > 0 ? (
                  <ol className="space-y-1 border-border/60 border-t bg-background/40 px-3 py-2.5">
                    {template.questions.map((question, index) => {
                      const difficulty = question.difficulty ?? "easy";
                      return (
                        <li className="flex items-start gap-2 text-sm" key={question.id}>
                          <span className="mt-0.5 w-6 shrink-0 font-mono text-[11px] text-muted-foreground/70 tabular-nums">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span
                            className={`mt-0.5 shrink-0 rounded-full px-1.5 py-px font-medium text-[10px] leading-tight ${DIFFICULTY_PILL[difficulty]}`}
                          >
                            {DIFFICULTY_LABEL[difficulty]}
                          </span>
                          <p className="min-w-0 flex-1 leading-relaxed">{question.content}</p>
                        </li>
                      );
                    })}
                  </ol>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
