"use client";

import type {
  InterviewQuestionTemplateInput,
  InterviewQuestionTemplateRecord,
  InterviewQuestionTemplateScope,
} from "@/lib/interview-question-templates";
import type { JobDescriptionListRecord } from "@/lib/job-descriptions";
import { useForm, useStore } from "@tanstack/react-form";
import { useEffect } from "react";
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
import { interviewQuestionTemplateSchema } from "@/lib/interview-question-templates";
import { hasFieldErrors, toFieldErrors } from "../../interviews/_components/interview-form";
import { SortableQuestionListEditor } from "../../_components/sortable-question-list-editor";

function defaultValues(): InterviewQuestionTemplateInput {
  return {
    description: "",
    jobDescriptionIds: [],
    questions: [{ content: "", difficulty: "easy", id: crypto.randomUUID(), sortOrder: 0 }],
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
      id: question.id,
      sortOrder: index,
    })),
    scope: record.scope,
    title: record.title,
  };
}

// oxlint-disable-next-line complexity -- Dialog orchestrates schema, mode, and question array state together.
export function InterviewQuestionTemplateEditorDialog({
  open,
  onOpenChange,
  record,
  jobDescriptions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: InterviewQuestionTemplateRecord | null;
  jobDescriptions: JobDescriptionListRecord[];
  onSaved: () => void;
}) {
  const isEdit = record !== null;

  const form = useForm({
    defaultValues: record ? toFormValues(record) : defaultValues(),
    onSubmit: async ({ value }) => {
      const body = {
        description: value.description?.trim() || "",
        jobDescriptionIds: value.scope === "job_description" ? value.jobDescriptionIds : [],
        questions: value.questions.map((question, index) => ({
          content: question.content.trim(),
          difficulty: question.difficulty,
          id: question.id,
          sortOrder: index,
        })),
        scope: value.scope,
        title: value.title.trim(),
      };

      const response = await fetch(
        isEdit ? `/api/studio/interview-questions/${record.id}` : "/api/studio/interview-questions",
        {
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
          method: isEdit ? "PATCH" : "POST",
        },
      );
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.error(payload?.error ?? (isEdit ? "更新失败" : "创建失败"));
        return;
      }
      toast.success(isEdit ? "面试题已更新" : "已创建面试题");
      onSaved();
      onOpenChange(false);
    },
    validators: { onSubmit: interviewQuestionTemplateSchema },
  });

  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const currentScope = useStore(form.store, (state) => state.values.scope);

  useEffect(() => {
    if (open) {
      form.reset(record ? toFormValues(record) : defaultValues());
    }
  }, [open, record, form]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "编辑面试题" : "新建面试题"}
      description="面试官在面试时按顺序向候选人必问的题目；面试创建瞬间的题目内容会被冻结为快照。"
      size="xl"
      bodyClassName="-mx-1 px-7 py-1.5 space-y-6"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            取消
          </Button>
          <Button isPending={isSubmitting} form="interview-question-template-form" type="submit">
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
                      <Textarea
                        aria-invalid={!!errors?.length}
                        className="max-h-32 min-h-16 resize-none"
                        id={field.name}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        placeholder="给团队的备注，例如这套题适用于哪种候选人"
                        rows={2}
                        value={field.state.value ?? ""}
                      />
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
              contentPlaceholder="请输入一道必问题目…"
              createItem={(sortIndex) => ({
                content: "",
                difficulty: "easy",
                id: crypto.randomUUID(),
                sortOrder: sortIndex,
              })}
              form={form}
              resetKey={record?.id ?? "new"}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}
