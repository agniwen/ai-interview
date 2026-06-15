"use client";

import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { TextareaCounter } from "@/components/ui/textarea-counter";
import { LoaderCircleIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const PROMPT_MAX = 2000;

export function JobDescriptionAiGeneratePanel({
  departmentName,
  jobName,
  onGenerated,
}: {
  departmentName: string | null;
  jobName: string;
  onGenerated: (result: { description: string; prompt: string; suggestedName?: string }) => void;
}) {
  const slug = useWorkspaceSlug();
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    if (!prompt.trim()) {
      toast.error("请填写 AI 生成指令");
      return;
    }

    setGenerating(true);
    try {
      const result = await rpcFetch<{
        description: string;
        prompt: string;
        suggestedName: string;
      }>(
        rpc.api.w[":slug"].studio["job-descriptions"]["ai-generate"].$post({
          json: {
            departmentName: departmentName ?? undefined,
            jobName: jobName.trim() || undefined,
            prompt: prompt.trim(),
          },
          param: { slug },
        }),
        "AI 生成岗位内容失败",
      );

      onGenerated({
        description: result.description,
        prompt: result.prompt,
        suggestedName: result.suggestedName,
      });
      toast.success("已生成岗位描述与 Prompt，可在下方编辑");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI 生成失败");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <SparklesIcon className="size-4 text-primary" />
        <p className="font-medium text-sm">AI 智能生成岗位内容</p>
      </div>
      <p className="mb-4 text-muted-foreground text-xs">
        根据填写指令与已填写的岗位名称、部门，自动生成岗位描述和 AI 面试 Prompt。
      </p>
      <Field>
        <FieldLabel>
          填写指令 <span className="text-destructive">*</span>
        </FieldLabel>
        <FieldContent className="gap-2">
          <div className="relative">
            <Textarea
              className="min-h-20 resize-none pb-6"
              maxLength={PROMPT_MAX}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="例如：高级前端工程师，要求 3 年以上 React/TypeScript 经验，重点考察组件设计、性能优化和团队协作"
              rows={3}
              value={prompt}
            />
            <TextareaCounter maxLength={PROMPT_MAX} value={prompt} />
          </div>
          <Button disabled={generating} onClick={() => void handleGenerate()} type="button">
            {generating ? (
              <LoaderCircleIcon className="size-4 animate-spin" />
            ) : (
              <SparklesIcon className="size-4" />
            )}
            {generating ? "生成中…" : "AI 生成岗位内容"}
          </Button>
        </FieldContent>
      </Field>
    </div>
  );
}
