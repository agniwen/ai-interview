"use client";

import type { InterviewQuestionTemplateQuestionInput } from "@arc/db-schema/interview-question-templates";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { TextareaCounter } from "@/components/ui/textarea-counter";
import { LoaderCircleIcon } from "@/components/icons/hugeicons";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const PROMPT_MAX = 2000;

function buildJobLabel(jd: JobDescriptionListRecord): string {
  return jd.departmentName ? `${jd.departmentName} / ${jd.name}` : jd.name;
}

export interface InterviewQuestionTemplateAiCreateResult {
  jobDescriptionId: string;
  questions: InterviewQuestionTemplateQuestionInput[];
}

export function InterviewQuestionTemplateAiCreateDialog({
  jobDescriptions,
  onGenerated,
  onOpenChange,
  open,
}: {
  jobDescriptions: JobDescriptionListRecord[];
  onGenerated: (result: InterviewQuestionTemplateAiCreateResult) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const slug = useWorkspaceSlug();
  const [prompt, setPrompt] = useState("");
  const [jobDescriptionId, setJobDescriptionId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const jobSelectOptions = useMemo(
    () =>
      jobDescriptions.map((jd) => ({
        description: jd.departmentName ?? undefined,
        label: buildJobLabel(jd),
        searchValue: `${jd.name} ${jd.departmentName ?? ""}`,
        value: jd.id,
      })),
    [jobDescriptions],
  );

  useEffect(() => {
    if (!open) {
      setPrompt("");
      setJobDescriptionId(null);
      setGenerating(false);
    }
  }, [open]);

  async function handleGenerate() {
    if (!jobDescriptionId) {
      toast.error("请选择岗位");
      return;
    }
    if (!prompt.trim()) {
      toast.error("请填写 AI 生成指令");
      return;
    }

    setGenerating(true);
    try {
      const result = await rpcFetch<{ questions: InterviewQuestionTemplateQuestionInput[] }>(
        rpc.api.w[":slug"].studio["interview-questions"]["ai-generate-questions"].$post({
          json: {
            jobDescriptionId,
            prompt: prompt.trim(),
          },
          param: { slug },
        }),
        "AI 生成面试题失败",
      );

      if (result.questions.length === 0) {
        toast.error("未生成任何题目，请调整指令后重试");
        return;
      }

      onGenerated({
        jobDescriptionId,
        questions: result.questions,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI 生成失败");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Modal
      description="选择岗位并填写指令，AI 将生成面试题并打开「新建面试题」供你确认与保存。"
      dismissible={!generating}
      footer={
        <>
          <Button
            disabled={generating}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={generating || !jobDescriptionId || !prompt.trim()}
            onClick={() => void handleGenerate()}
            type="button"
          >
            {generating ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
            {generating ? "生成题目中…" : "生成题目"}
          </Button>
        </>
      }
      onOpenChange={(next) => {
        if (!generating) {
          onOpenChange(next);
        }
      }}
      open={open}
      size="lg"
      title="AI 创建面试题"
    >
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel>
            岗位选择 <span className="text-destructive">*</span>
          </FieldLabel>
          <FieldContent>
            <SearchableSelect
              disabled={generating || jobSelectOptions.length === 0}
              emptyMessage="没有可选岗位"
              onChange={setJobDescriptionId}
              options={jobSelectOptions}
              placeholder={jobSelectOptions.length === 0 ? "暂无在招岗位" : "选择岗位"}
              searchPlaceholder="搜索岗位名称或部门…"
              value={jobDescriptionId}
            />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel>
            填写指令 <span className="text-destructive">*</span>
          </FieldLabel>
          <FieldContent>
            <div className="relative">
              <Textarea
                className="min-h-24 resize-none pb-6"
                disabled={generating}
                maxLength={PROMPT_MAX}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="例如：生成 10 道前端面试题，5 道基础（React/TS）+ 5 道项目深度追问，由浅入深"
                rows={4}
                value={prompt}
              />
              <TextareaCounter maxLength={PROMPT_MAX} value={prompt} />
            </div>
          </FieldContent>
        </Field>
      </FieldGroup>
    </Modal>
  );
}
