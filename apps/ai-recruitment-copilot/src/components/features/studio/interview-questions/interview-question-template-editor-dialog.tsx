"use client";

import { IconLoader2 } from "@tabler/icons-react";
import type {
  InterviewQuestionTemplateInput,
  InterviewQuestionTemplateRecord,
  InterviewQuestionTemplateScope,
} from "@arc/db-schema/interview-question-templates";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import { rpc } from "@/lib/client/rpc";
import { useForm, useStore } from "@tanstack/react-form";

import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { interviewQuestionTemplateSchema } from "@arc/db-schema/interview-question-templates";
import { hasFieldErrors, toFieldErrors } from "../interviews/interview-form";
import { SortableQuestionListEditor } from "../sortable-question-list-editor";

const TITLE_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 1000;
const QUESTION_MAX_LENGTH = 1000;

export function emptyInterviewQuestionTemplateValues(): InterviewQuestionTemplateInput {
  return {
    description: "",
    jobDescriptionIds: [],
    questions: [
      {
        content: "",
        difficulty: "easy",
        evaluationFocus: "",
        followUpDirections: "",
        id: crypto.randomUUID(),
        sortOrder: 0,
      },
    ],
    scope: "global",
    title: "",
  };
}

function toFormValues(record: InterviewQuestionTemplateRecord): InterviewQuestionTemplateInput {
  return {
    description: record.description ?? "",
    jobDescriptionIds: record.jobDescriptionIds,
    questions: record.questions.map((question, index) => ({
      content: question.content,
      difficulty: question.difficulty ?? "easy",
      evaluationFocus: question.evaluationFocus ?? "",
      followUpDirections: question.followUpDirections ?? "",
      id: question.id,
      sortOrder: index,
    })),
    scope: record.scope,
    title: record.title,
  };
}

// oxlint-disable-next-line complexity -- Dialog orchestrates schema, mode, and question array state together.
export function InterviewQuestionTemplateEditorDialog({
  initialDraft,
  open,
  onOpenChange,
  record,
  jobDescriptions,
  onSaved,
  slug,
}: {
  initialDraft?: InterviewQuestionTemplateInput | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: InterviewQuestionTemplateRecord | null;
  jobDescriptions: JobDescriptionListRecord[];
  onSaved: () => void;
  slug: string;
}) {
  const isEdit = record !== null;
  const resolvedInitialValues = useMemo(() => {
    if (record) {
      return toFormValues(record);
    }
    if (initialDraft) {
      return initialDraft;
    }
    return emptyInterviewQuestionTemplateValues();
  }, [initialDraft, record]);

  const form = useForm({
    defaultValues: resolvedInitialValues,
    onSubmit: async ({ value }) => {
      const body = {
        description: value.description?.trim() || "",
        jobDescriptionIds: value.scope === "job_description" ? value.jobDescriptionIds : [],
        questions: value.questions.map((question, index) => ({
          content: question.content.trim(),
          difficulty: question.difficulty,
          evaluationFocus: question.evaluationFocus?.trim() || "",
          followUpDirections: question.followUpDirections?.trim() || "",
          id: question.id,
          sortOrder: index,
        })),
        scope: value.scope,
        title: value.title.trim(),
      };

      const response = isEdit
        ? await rpc.api.w[":slug"].studio["interview-questions"][":id"].$patch({
            json: body,
            param: { id: record.id, slug },
          })
        : await rpc.api.w[":slug"].studio["interview-questions"].$post({
            json: body,
            param: { slug },
          });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.error(payload?.error ?? (isEdit ? "更新失败" : "创建失败"));
        return;
      }
      toast.success(isEdit ? "沟通题已更新" : "已创建沟通题");
      onSaved();
      onOpenChange(false);
    },
    validators: { onSubmit: interviewQuestionTemplateSchema },
  });

  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const currentScope = useStore(form.store, (state) => state.values.scope);
  const questionListErrors = useStore(form.store, (state) =>
    toFieldErrors(state.fieldMeta.questions?.errors),
  );

  useEffect(() => {
    if (open) {
      form.reset(resolvedInitialValues);
    }
  }, [open, form, resolvedInitialValues]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "编辑沟通题" : "新建沟通题"}
      description="AI 面试时按顺序向候选人追问的题目；创建面试瞬间会冻结为快照，之后编辑不影响已发起的面试。"
      size="xl"
      bodyClassName="-mx-1 px-7 py-1.5 space-y-6"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            取消
          </Button>
          <Button disabled={isSubmitting} form="interview-question-template-form" type="submit">
            {isSubmitting ? <IconLoader2 className="size-4 animate-spin" /> : null}
            {isEdit ? "保存" : "创建"}
          </Button>
        </>
      }
    >
      <form
        id="interview-question-template-form"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <div className="space-y-6">
          <FieldGroup className="gap-5">
            <form.Field name="title">
              {(field) => {
                const errors = toFieldErrors(field.state.meta.errors);
                return (
                  <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                    <FieldLabel htmlFor={field.name}>
                      标题 <span className="text-destructive">*</span>
                    </FieldLabel>
                    <FieldContent className="gap-2">
                      <Input
                        aria-invalid={!!errors?.length}
                        id={field.name}
                        maxLength={TITLE_MAX_LENGTH}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        placeholder="例如：通用沟通题、前端深度题"
                        value={field.state.value}
                      />
                      <FieldError errors={errors} />
                    </FieldContent>
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="description">
              {(field) => {
                const errors = toFieldErrors(field.state.meta.errors);
                return (
                  <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                    <FieldLabel htmlFor={field.name}>说明（可选）</FieldLabel>
                    <FieldContent className="gap-2">
                      <div className="relative">
                        <Textarea
                          aria-invalid={!!errors?.length}
                          className="max-h-32 min-h-16 resize-none pb-6"
                          id={field.name}
                          maxLength={DESCRIPTION_MAX_LENGTH}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                          placeholder="给团队的备注，例如这套题适用于哪种候选人"
                          rows={2}
                          value={field.state.value ?? ""}
                        />
                        <TextareaCounter
                          maxLength={DESCRIPTION_MAX_LENGTH}
                          value={field.state.value}
                        />
                      </div>
                      <FieldError errors={errors} />
                    </FieldContent>
                  </Field>
                );
              }}
            </form.Field>

            <div className="grid gap-5 md:grid-cols-2">
              <form.Field name="scope">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>
                      作用范围 <span className="text-destructive">*</span>
                    </FieldLabel>
                    <FieldContent className="gap-2">
                      <Select
                        onValueChange={(value) => {
                          field.handleChange(value as InterviewQuestionTemplateScope);
                          if (value === "global") {
                            form.setFieldValue("jobDescriptionIds", []);
                          }
                        }}
                        value={field.state.value}
                      >
                        <SelectTrigger className="w-full" id={field.name}>
                          <SelectValue placeholder="选择作用范围" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="global">全局（所有面试）</SelectItem>
                          <SelectItem value="job_description">指定在招岗位</SelectItem>
                        </SelectContent>
                      </Select>
                    </FieldContent>
                  </Field>
                )}
              </form.Field>

              {currentScope === "job_description" ? (
                <form.Field name="jobDescriptionIds">
                  {(field) => {
                    const errors = toFieldErrors(field.state.meta.errors);
                    return (
                      <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                        <FieldLabel htmlFor={field.name}>
                          绑定岗位 <span className="text-destructive">*</span>
                        </FieldLabel>
                        <FieldContent className="gap-2">
                          <SearchableMultiSelect
                            emptyMessage="没有匹配的岗位"
                            invalid={!!errors?.length}
                            onChange={(next) => field.handleChange(next)}
                            options={jobDescriptions.map((jd) => ({
                              label: jd.name,
                              value: jd.id,
                            }))}
                            placeholder="选择岗位…"
                            searchPlaceholder="搜索岗位…"
                            selectedFormat={(count) => `已选 ${count} 个岗位`}
                            selectedPreviewLimit={2}
                            value={field.state.value ?? []}
                          />
                          <FieldError errors={errors} />
                        </FieldContent>
                      </Field>
                    );
                  }}
                </form.Field>
              ) : null}
            </div>
          </FieldGroup>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">题目列表</h3>
              <form.Subscribe selector={(state) => state.values.questions.length}>
                {(len) => <span className="text-muted-foreground text-xs">共 {len} 道</span>}
              </form.Subscribe>
            </div>
            <SortableQuestionListEditor
              arrayFieldName="questions"
              contentFieldName="content"
              contentMaxLength={QUESTION_MAX_LENGTH}
              contentPlaceholder="请输入一道必问题目…"
              createItem={(sortIndex) => ({
                content: "",
                difficulty: "easy",
                evaluationFocus: "",
                followUpDirections: "",
                id: crypto.randomUUID(),
                sortOrder: sortIndex,
              })}
              form={form}
              resetKey={record?.id ?? "new"}
            />
            <FieldError errors={questionListErrors} />
          </div>
        </div>
      </form>
    </Modal>
  );
}
