"use client";

import { IconLoader2 } from "@tabler/icons-react";
import type {
  InterviewQuestionTemplateInput,
  InterviewQuestionTemplateRecord,
} from "@app/db-schema/interview-question-templates";
import {
  interviewQuestionTemplateScopeSchema,
  interviewQuestionTemplateSchema,
} from "@app/db-schema/interview-question-templates";
import {
  pickInterviewQuestionAgentPageContext,
  toInterviewQuestionFormQuestions,
} from "@app/shared/interview-question-agent";
import type { InterviewQuestionAgentPageContext } from "@app/shared/interview-question-agent";
import type { JobDescriptionListRecord } from "@app/shared/job-descriptions";
import {
  subscribeToFormStore,
  useRegisterSubjectAgentForm,
} from "@/components/features/subject-agent/subject-agent-context";
import type { SubjectAgentFormBridge } from "@/components/features/subject-agent/subject-agent-context";
import { rpc } from "@/lib/client/rpc";
import { useForm, useStore } from "@tanstack/react-form";

import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { EditorPageSurface } from "../editor-page-surface";
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
import { hasFieldErrors, toFieldErrors } from "../interviews/interview-form";
import { SortableQuestionListEditor } from "../sortable-question-list-editor";

const TITLE_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 1000;
const QUESTION_MAX_LENGTH = 1000;
const errorPayloadSchema = z.object({ error: z.string().optional() });

function emptyInterviewQuestionTemplateValues(): InterviewQuestionTemplateInput {
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
  presentation = "dialog",
  initialDraft,
  open,
  onOpenChange,
  record,
  jobDescriptions,
  onSaved,
  onCreated,
  slug,
}: {
  presentation?: "dialog" | "page";
  initialDraft?: InterviewQuestionTemplateInput | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: InterviewQuestionTemplateRecord | null;
  jobDescriptions: JobDescriptionListRecord[];
  onSaved: () => void;
  onCreated?: (id: string) => void;
  slug: string;
}) {
  const Surface = presentation === "page" ? EditorPageSurface : Modal;
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
      const result: unknown = await response.json().catch(() => null);
      const payload = errorPayloadSchema.safeParse(result);
      if (!response.ok) {
        toast.error(
          (payload.success ? payload.data.error : undefined) ?? (isEdit ? "更新失败" : "创建失败"),
        );
        return;
      }
      toast.success(isEdit ? "沟通题已更新" : "已创建沟通题");
      onSaved();
      if (!isEdit && onCreated) {
        const saved = z.object({ id: z.string() }).parse(result);
        onCreated(saved.id);
      } else {
        onOpenChange(false);
      }
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
  // Hireseer Agent 只写入未保存的表单（ADR-0045）；不在 Agent Provider 内时登记为空操作。
  const agentFormBridge = useMemo<SubjectAgentFormBridge>(
    () => ({
      getPageContext: () => pickInterviewQuestionAgentPageContext(form.state.values),
      getSavedContext: () =>
        record ? pickInterviewQuestionAgentPageContext(resolvedInitialValues) : null,
      kind: "interview_question_template",
      subscribe: (listener) => subscribeToFormStore(form.store, listener),
      write: (values: Partial<InterviewQuestionAgentPageContext>) => {
        if (values.title !== undefined) {
          form.setFieldValue("title", values.title);
        }
        if (values.description !== undefined) {
          form.setFieldValue("description", values.description);
        }
        if (values.scope !== undefined) {
          form.setFieldValue("scope", values.scope);
        }
        if (values.jobDescriptionIds !== undefined) {
          form.setFieldValue("jobDescriptionIds", values.jobDescriptionIds);
        }
        if (values.questions !== undefined) {
          form.setFieldValue("questions", toInterviewQuestionFormQuestions(values.questions));
        }
      },
    }),
    [form, record, resolvedInitialValues],
  );
  useRegisterSubjectAgentForm(agentFormBridge);

  return (
    <Surface
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "编辑沟通题" : "创建沟通题"}
      description="候选人点击开始面试时绑定最新题目；修改不会影响本次已开始的面试。"
      size="xl"
      bodyClassName="-mx-1 px-7 py-1.5 space-y-6"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            取消
          </Button>
          <Button disabled={isSubmitting} form="interview-question-template-form" type="submit">
            {isSubmitting ? <IconLoader2 className="size-4 animate-spin" /> : null}
            {isEdit || presentation === "page" ? "保存" : "创建"}
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
        <div className="min-w-0 space-y-6">
          <FieldGroup
            className={
              presentation === "page"
                ? "gap-5 rounded-xl bg-card text-card-foreground p-5 shadow-default"
                : "gap-5"
            }
          >
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

            <div
              className={
                presentation === "page"
                  ? "flex min-w-0 flex-col gap-5"
                  : "grid gap-5 md:grid-cols-2"
              }
            >
              <form.Field name="scope">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>
                      作用范围 <span className="text-destructive">*</span>
                    </FieldLabel>
                    <FieldContent className="gap-2">
                      <Select
                        onValueChange={(value) => {
                          const scope = interviewQuestionTemplateScopeSchema.safeParse(value);
                          if (!scope.success) {
                            return;
                          }
                          field.handleChange(scope.data);
                          if (scope.data === "global") {
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

          <div className="min-w-0 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">题目列表</h3>
              <form.Subscribe selector={(state) => state.values.questions.length}>
                {(len) => <span className="text-muted-foreground text-xs">共 {len} 道</span>}
              </form.Subscribe>
            </div>
            <SortableQuestionListEditor
              collapsible={presentation === "page"}
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
    </Surface>
  );
}
