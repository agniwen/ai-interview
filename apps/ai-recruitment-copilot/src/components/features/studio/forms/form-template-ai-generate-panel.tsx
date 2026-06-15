"use client";

import type { CandidateFormQuestionInput } from "@arc/db-schema/candidate-forms";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TextareaCounter } from "@/components/ui/textarea-counter";
import { LoaderCircleIcon, SparklesIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const PROMPT_MAX = 2000;
const JOB_CONTEXT_FORM = "__form_jd__";
const JOB_CONTEXT_CANDIDATE = "__candidate_jd__";

interface CandidateOption {
  candidateName: string;
  id: string;
  jobDescriptionName: string | null;
}

export function FormTemplateAiGeneratePanel({
  formDescription,
  formScope,
  formTitle,
  jobDescriptionIds,
  jobDescriptions,
  onGenerated,
  templateId,
}: {
  formDescription: string;
  formScope: "global" | "job_description";
  formTitle: string;
  jobDescriptionIds: string[];
  jobDescriptions: JobDescriptionListRecord[];
  onGenerated: (questions: CandidateFormQuestionInput[]) => void;
  templateId: string | null;
}) {
  const slug = useWorkspaceSlug();
  const [prompt, setPrompt] = useState("");
  const [candidateOptions, setCandidateOptions] = useState<CandidateOption[]>([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [jobDescriptionId, setJobDescriptionId] = useState<string>(JOB_CONTEXT_FORM);
  const [generating, setGenerating] = useState(false);

  const defaultJobContext = useMemo(() => {
    if (formScope === "job_description" && jobDescriptionIds.length > 0) {
      return JOB_CONTEXT_FORM;
    }
    if (selectedCandidateIds.length > 0) {
      return JOB_CONTEXT_CANDIDATE;
    }
    return JOB_CONTEXT_FORM;
  }, [formScope, jobDescriptionIds.length, selectedCandidateIds.length]);

  useEffect(() => {
    setJobDescriptionId(defaultJobContext);
  }, [defaultJobContext]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoadingCandidates(true);
      try {
        const result = await rpcFetch<{ records: CandidateOption[] }>(
          rpc.api.w[":slug"].studio.forms.candidates.search.$get({
            param: { slug },
            query: {
              templateId: templateId ?? undefined,
            },
          }),
          "加载候选人失败",
        );
        setCandidateOptions(result.records);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "加载候选人失败");
      } finally {
        setLoadingCandidates(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [slug, templateId]);

  const candidateSelectOptions = useMemo(
    () =>
      candidateOptions.map((candidate) => ({
        description: candidate.jobDescriptionName ?? undefined,
        label: candidate.candidateName,
        searchValue: `${candidate.candidateName} ${candidate.jobDescriptionName ?? ""}`,
        value: candidate.id,
      })),
    [candidateOptions],
  );

  const jobContextOptions = useMemo(() => {
    const options: { label: string; value: string }[] = [];
    if (formScope === "job_description" && jobDescriptionIds.length > 0) {
      options.push({ label: "使用表单绑定的岗位", value: JOB_CONTEXT_FORM });
    }
    if (selectedCandidateIds.length > 0) {
      options.push({ label: "使用候选人关联岗位", value: JOB_CONTEXT_CANDIDATE });
    }
    for (const jd of jobDescriptions) {
      options.push({ label: jd.name, value: jd.id });
    }
    return options;
  }, [formScope, jobDescriptionIds.length, jobDescriptions, selectedCandidateIds.length]);

  async function handleGenerate() {
    if (!prompt.trim()) {
      toast.error("请填写 AI 生成指令");
      return;
    }

    setGenerating(true);
    try {
      const resolvedJobId =
        jobDescriptionId === JOB_CONTEXT_FORM || jobDescriptionId === JOB_CONTEXT_CANDIDATE
          ? undefined
          : jobDescriptionId;

      const result = await rpcFetch<{ questions: CandidateFormQuestionInput[] }>(
        rpc.api.w[":slug"].studio.forms["ai-generate-questions"].$post({
          json: {
            interviewRecordIds: selectedCandidateIds.length > 0 ? selectedCandidateIds : undefined,
            jobDescriptionId: resolvedJobId,
            jobDescriptionIds:
              formScope === "job_description" && jobDescriptionId === JOB_CONTEXT_FORM
                ? jobDescriptionIds
                : undefined,
            prompt: prompt.trim(),
            templateDescription: formDescription.trim() || undefined,
            templateTitle: formTitle.trim() || undefined,
          },
          param: { slug },
        }),
        "AI 生成题目失败",
      );

      if (result.questions.length === 0) {
        toast.error("未生成任何题目，请调整指令后重试");
        return;
      }

      onGenerated(result.questions);
      toast.success(`已生成 ${result.questions.length} 道题目，可在预览区编辑`);
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
        <p className="font-medium text-sm">AI 智能生成题目</p>
      </div>
      <p className="mb-4 text-muted-foreground text-xs">
        根据候选人、岗位信息与填写指令，自动生成单选、多选或填写题，并填入下方预览画布。
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel>参考候选人（可选）</FieldLabel>
          <FieldContent>
            <SearchableMultiSelect
              disabled={loadingCandidates}
              emptyMessage={loadingCandidates ? "加载中…" : "没有匹配的候选人"}
              onChange={setSelectedCandidateIds}
              options={candidateSelectOptions}
              placeholder="选择候选人以带入简历上下文"
              searchPlaceholder="搜索候选人姓名或邮箱…"
              selectedFormat={(count) => `已选 ${count} 位候选人`}
              value={selectedCandidateIds}
            />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel>岗位上下文</FieldLabel>
          <FieldContent>
            <Select onValueChange={setJobDescriptionId} value={jobDescriptionId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择岗位上下文" />
              </SelectTrigger>
              <SelectContent>
                {jobContextOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>

        <Field className="md:col-span-2">
          <FieldLabel>
            填写指令 <span className="text-destructive">*</span>
          </FieldLabel>
          <FieldContent className="gap-2">
            <div className="relative">
              <Textarea
                className="min-h-20 resize-none pb-6"
                maxLength={PROMPT_MAX}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="例如：生成 8 道题，包含 3 道单选（技术栈偏好）、2 道多选（项目经验标签）、3 道填写题（项目细节与职业规划）"
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
              {generating ? "生成中…" : "AI 生成题目"}
            </Button>
          </FieldContent>
        </Field>
      </div>
    </div>
  );
}
