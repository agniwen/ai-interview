"use client";

import {
  IconCircleDot,
  IconListCheck,
  IconLoader2,
  IconPlus,
  IconSettings2,
  IconSquareCheck,
  IconTrash,
  IconTypeface,
} from "@tabler/icons-react";
/* oxlint-disable eslint(no-use-before-define) jsx-a11y(prefer-tag-over-role) */
/* eslint-disable no-use-before-define, jsx-a11y/prefer-tag-over-role */

import type {
  CandidateFormDisplayMode,
  CandidateFormQuestionInput,
  CandidateFormQuestionType,
  CandidateFormTemplateInput,
  CandidateFormTemplateRecord,
} from "@arc/db-schema/candidate-forms";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useForm, useStore } from "@tanstack/react-form";

import type { KeyboardEvent, MouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { SortableDragHandle, SortableItem, SortableList } from "@/components/ui/sortable-list";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TextareaCounter } from "@/components/ui/textarea-counter";
import { cn } from "@arc/shared/utils";
import {
  candidateFormQuestionInputSchema,
  candidateFormQuestionTypeSchema,
  candidateFormScopeSchema,
  candidateFormTemplateSchema,
  DEFAULT_DISPLAY_MODE,
} from "@arc/db-schema/candidate-forms";
import { z } from "zod";
import { hasFieldErrors, toFieldErrors } from "../interviews/interview-form";
import { QuestionConfigPanel, QuestionPreview } from "./form-template-question-config";

const DISPLAY_MODE_LABELS = {
  checkbox: "复选框",
  input: "单行输入",
  radio: "单选框",
  select: "下拉选择",
  textarea: "多行输入",
} satisfies Record<CandidateFormDisplayMode, string>;

const QUESTION_TYPE_LABELS = {
  multi: "多选题",
  single: "单选题",
  text: "填写题",
} satisfies Record<CandidateFormQuestionType, string>;

const QUESTION_TYPE_META = {
  multi: {
    description: "候选人可选择多个答案",
    icon: IconSquareCheck,
  },
  single: {
    description: "候选人只能选择一个答案",
    icon: IconCircleDot,
  },
  text: {
    description: "候选人填写文本内容",
    icon: IconTypeface,
  },
} satisfies Record<CandidateFormQuestionType, { description: string; icon: typeof IconCircleDot }>;

const errorPayloadSchema = z.object({ error: z.string().optional() }).nullable();

const TITLE_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 1000;

function makeDefaultQuestion(
  sortOrder: number,
  type: CandidateFormQuestionType = "single",
): CandidateFormQuestionInput {
  return {
    displayMode: DEFAULT_DISPLAY_MODE[type],
    helperText: "",
    id: crypto.randomUUID(),
    label: "",
    options:
      type === "text"
        ? []
        : [
            { label: "选项 1", value: "option_1" },
            { label: "选项 2", value: "option_2" },
          ],
    required: true,
    sortOrder,
    type,
  };
}

export function emptyFormTemplateValues(): CandidateFormTemplateInput {
  return {
    description: "",
    jobDescriptionIds: [],
    questions: [makeDefaultQuestion(0)],
    scope: "global",
    title: "",
  };
}

function toFormValues(record: CandidateFormTemplateRecord): CandidateFormTemplateInput {
  return {
    description: record.description ?? "",
    jobDescriptionIds: record.jobDescriptionIds,
    questions: record.questions.map((question, index) => ({
      displayMode: question.displayMode,
      helperText: question.helperText ?? "",
      id: question.id,
      label: question.label,
      options: question.options.map((option) => ({ ...option })),
      required: question.required,
      sortOrder: index,
      type: question.type,
    })),
    scope: record.scope,
    title: record.title,
  };
}

// oxlint-disable-next-line complexity -- Dialog orchestrates schema, mode, and question array state together.
export function CandidateFormTemplateEditorDialog({
  initialDraft,
  open,
  onOpenChange,
  record,
  jobDescriptions,
  onSaved,
}: {
  initialDraft?: CandidateFormTemplateInput | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: CandidateFormTemplateRecord | null;
  jobDescriptions: JobDescriptionListRecord[];
  onSaved: () => void;
}) {
  const slug = useWorkspaceSlug();
  const isEdit = record !== null;
  const resolvedInitialValues = useMemo(() => {
    if (record) {
      return toFormValues(record);
    }
    if (initialDraft) {
      return initialDraft;
    }
    return emptyFormTemplateValues();
  }, [initialDraft, record]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(
    resolvedInitialValues.questions[0]?.id ?? null,
  );

  const form = useForm({
    defaultValues: resolvedInitialValues,
    onSubmit: async ({ value }) => {
      const body = {
        description: value.description?.trim() || "",
        jobDescriptionIds: value.scope === "job_description" ? value.jobDescriptionIds : [],
        questions: value.questions.map((question, index) => ({
          displayMode: question.displayMode,
          helperText: question.helperText?.trim() || "",
          id: question.id,
          label: question.label.trim(),
          options: question.type === "text" ? [] : question.options,
          required: question.required,
          sortOrder: index,
          type: question.type,
        })),
        scope: value.scope,
        title: value.title.trim(),
      };

      const response = isEdit
        ? await rpc.api.w[":slug"].studio.forms[":id"].$patch({
            json: body,
            param: { id: record.id, slug },
          })
        : await rpc.api.w[":slug"].studio.forms.$post({ json: body, param: { slug } });
      const rawPayload = await response.json().catch(() => null);
      const parsedPayload = errorPayloadSchema.safeParse(rawPayload);
      const payload = parsedPayload.success ? parsedPayload.data : null;
      if (!response.ok) {
        toast.error(payload?.error ?? (isEdit ? "更新失败" : "创建失败"));
        return;
      }
      toast.success(isEdit ? "表单题已更新" : "已创建表单题");
      onSaved();
      onOpenChange(false);
    },
    validators: { onSubmit: candidateFormTemplateSchema },
  });

  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const currentScope = useStore(form.store, (state) => state.values.scope);
  const questionIds = useStore(form.store, (state) =>
    (state.values.questions ?? []).map((question) => question.id),
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    if (questionIds.length === 0) {
      // oxlint-disable-next-line react/set-state-in-effect -- This effect intentionally synchronizes state with an external lifecycle.
      setSelectedQuestionId(null);
      return;
    }
    if (!selectedQuestionId || !questionIds.includes(selectedQuestionId)) {
      setSelectedQuestionId(questionIds[0] ?? null);
    }
  }, [open, questionIds, selectedQuestionId]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "编辑表单题" : "新建表单题"}
      description="提交后的题目内容不会随模板修改。"
      size="full"
      className="h-[90vh]"
      bodyClassName="overflow-y-auto p-0"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            取消
          </Button>
          <Button disabled={isSubmitting} form="form-template-form" type="submit">
            {isSubmitting ? <IconLoader2 className="size-4 animate-spin" /> : null}
            {isEdit ? "保存" : "创建"}
          </Button>
        </>
      }
    >
      <form
        className="flex min-h-full flex-col"
        id="form-template-form"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <div className="flex min-h-full flex-col">
          <div className="shrink-0 border-b bg-muted/10 px-6 py-4">
            <FieldGroup className="gap-5">
              <form.Field name="title">
                {(field) => {
                  const errors = toFieldErrors(field.state.meta.errors);
                  return (
                    <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
                      <FieldLabel htmlFor={field.name}>
                        表单标题 <span className="text-destructive">*</span>
                      </FieldLabel>
                      <FieldContent className="gap-2">
                        <Input
                          aria-invalid={!!errors?.length}
                          id={field.name}
                          maxLength={TITLE_MAX_LENGTH}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                          placeholder="例如：候选人背景调查表"
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
                            placeholder="告知候选人这份表单的用途或填写须知"
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
                            const parsed = candidateFormScopeSchema.safeParse(value);
                            if (!parsed.success) {
                              return;
                            }
                            field.handleChange(parsed.data);
                            if (parsed.data === "global") {
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
          </div>
          <QuestionBuilderWorkspace
            form={form}
            selectedQuestionId={selectedQuestionId}
            setSelectedQuestionId={setSelectedQuestionId}
          />
        </div>
      </form>
    </Modal>
  );
}

// tanstack-form's deeply-generic useForm return type can't be reified as a
// prop type without losing the concrete form-data type, so accept it loosely
// for the sub-components.
// oxlint-disable-next-line no-explicit-any
type TemplateFormApi = any;

function QuestionBuilderWorkspace({
  form,
  selectedQuestionId,
  setSelectedQuestionId,
}: {
  form: TemplateFormApi;
  selectedQuestionId: string | null;
  setSelectedQuestionId: (id: string | null) => void;
}) {
  return (
    <form.Field mode="array" name="questions">
      {/* oxlint-disable-next-line no-explicit-any */}
      {(field: any) => (
        <QuestionBuilderBody
          field={field}
          form={form}
          selectedQuestionId={selectedQuestionId}
          setSelectedQuestionId={setSelectedQuestionId}
        />
      )}
    </form.Field>
  );
}

function QuestionBuilderBody({
  field,
  form,
  selectedQuestionId,
  setSelectedQuestionId,
}: {
  // oxlint-disable-next-line no-explicit-any
  field: any;
  form: TemplateFormApi;
  selectedQuestionId: string | null;
  setSelectedQuestionId: (id: string | null) => void;
}) {
  const questions = useStore(
    form.store,
    // oxlint-disable-next-line no-explicit-any
    (state: any) => {
      const parsed = candidateFormQuestionInputSchema
        .array()
        .safeParse(state.values.questions ?? []);
      return parsed.success ? parsed.data : [];
    },
  );
  const items = questions.filter(
    (item): item is CandidateFormQuestionInput & { id: string } =>
      typeof item.id === "string" && item.id.length > 0,
  );
  const ids = items.map((item) => item.id);
  const selectedIndex = items.findIndex((item) => item.id === selectedQuestionId);
  const activeIndex = Math.max(selectedIndex, 0);
  const activeQuestion = items[activeIndex] ?? null;
  const [pendingDeleteQuestionId, setPendingDeleteQuestionId] = useState<string | null>(null);
  const pendingDeleteQuestion = items.find((item) => item.id === pendingDeleteQuestionId) ?? null;
  const pendingDeleteIndex = pendingDeleteQuestion
    ? items.findIndex((item) => item.id === pendingDeleteQuestion.id)
    : -1;
  const templateTitle = useStore(
    form.store,
    // oxlint-disable-next-line no-explicit-any
    (state: any) => {
      const parsed = z.string().safeParse(state.values.title);
      return parsed.success ? parsed.data.trim() || "未命名表单题" : "未命名表单题";
    },
  );
  const templateDescription = useStore(
    form.store,
    // oxlint-disable-next-line no-explicit-any
    (state: any) => {
      const parsed = z.string().safeParse(state.values.description);
      return parsed.success ? parsed.data.trim() : "";
    },
  );

  function addQuestion(type: CandidateFormQuestionType) {
    const next = makeDefaultQuestion(items.length, type);
    const nextId = next.id ?? crypto.randomUUID();
    field.pushValue({ ...next, id: nextId });
    setSelectedQuestionId(nextId);
  }

  function removeQuestion(index: number) {
    if (items.length <= 1) {
      return;
    }
    const nextSelected = items[index + 1] ?? items[index - 1] ?? null;
    field.removeValue(index);
    setSelectedQuestionId(nextSelected?.id ?? null);
  }

  function confirmRemoveQuestion() {
    if (pendingDeleteIndex === -1) {
      setPendingDeleteQuestionId(null);
      return;
    }
    removeQuestion(pendingDeleteIndex);
    setPendingDeleteQuestionId(null);
  }

  return (
    <>
      <div className="flex min-h-72 flex-1 items-center justify-center bg-muted/20 px-5 py-8 md:hidden">
        <Card className="max-w-sm gap-0 rounded-lg border-dashed py-0">
          <CardContent className="px-5 py-6 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <IconListCheck className="size-5" />
            </div>
            <p className="mt-3 font-medium text-sm">题目需要在 PC 端编辑</p>
            <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
              移动端暂不展示题目编辑器。请使用桌面端完成题目添加、排序和配置。
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="hidden h-[58vh] min-h-[460px] max-h-[876px] flex-none grid-cols-[220px_minmax(0,1fr)_360px] overflow-hidden md:grid">
        <aside className="flex min-h-0 flex-col gap-3 border-r bg-background px-4 py-4">
          <div className="flex items-center gap-2">
            <IconPlus className="size-4 text-muted-foreground" />
            <h3 className="font-medium text-sm">题目类型</h3>
          </div>
          <div className="flex flex-col gap-2">
            {candidateFormQuestionTypeSchema.options.map((type) => {
              const Icon = QUESTION_TYPE_META[type].icon;
              return (
                <Button
                  className="group relative h-auto overflow-hidden px-3 py-2.5 text-left"
                  key={type}
                  onClick={() => addQuestion(type)}
                  type="button"
                  variant="outline"
                >
                  <span className="flex min-w-0 items-center gap-3 transition-opacity group-focus-visible:opacity-35 group-hover:opacity-35">
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-sm">
                        {QUESTION_TYPE_LABELS[type]}
                      </span>
                      <span className="block text-muted-foreground text-xs leading-normal">
                        {QUESTION_TYPE_META[type].description}
                      </span>
                    </span>
                  </span>
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60 opacity-0 backdrop-blur-[1px] transition-opacity group-focus-visible:opacity-100 group-hover:opacity-100">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2 py-1 font-medium text-primary-foreground text-xs shadow-xs">
                      <IconPlus className="size-3.5" />
                      点击添加
                    </span>
                  </span>
                </Button>
              );
            })}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col bg-muted/20">
          <div className="flex shrink-0 items-center justify-between border-b bg-background px-5 py-3">
            <div className="flex items-center gap-2">
              <IconListCheck className="size-4 text-muted-foreground" />
              <h3 className="font-medium text-sm">预览画布</h3>
            </div>
            <span className="text-muted-foreground text-xs">共 {items.length} 道</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <Card className="mx-auto w-full max-w-2xl gap-0 rounded-xl border-border bg-card py-0">
              <CardContent className="p-5">
                <header className="mb-4">
                  <h2 className="text-lg">{templateTitle}</h2>
                  {templateDescription ? (
                    <p className="mt-1 text-muted-foreground text-sm">{templateDescription}</p>
                  ) : null}
                </header>
                <SortableList
                  className="space-y-5"
                  ids={ids}
                  onReorder={(from, to) => field.moveValue(from, to)}
                >
                  {items.map((item, index) => (
                    <SortableItem id={item.id} key={item.id}>
                      {({ handleProps, isDragging }) => (
                        <QuestionCanvasCard
                          handleProps={handleProps}
                          index={index}
                          isActive={item.id === activeQuestion?.id}
                          isDragging={isDragging}
                          onRemove={
                            items.length > 1 ? () => setPendingDeleteQuestionId(item.id) : undefined
                          }
                          onSelect={() => setSelectedQuestionId(item.id)}
                          question={item}
                        />
                      )}
                    </SortableItem>
                  ))}
                </SortableList>
              </CardContent>
            </Card>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col border-l bg-background">
          <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
            <IconSettings2 className="size-4 text-muted-foreground" />
            <h3 className="font-medium text-sm">题目配置</h3>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {activeQuestion ? (
              <QuestionConfigPanel
                form={form}
                index={activeIndex}
                onRemove={
                  items.length > 1 && activeQuestion
                    ? () => setPendingDeleteQuestionId(activeQuestion.id)
                    : undefined
                }
              />
            ) : (
              <Card className="h-full min-h-40 gap-0 rounded-lg border-dashed bg-muted/20 py-0">
                <CardContent className="flex h-full min-h-40 flex-col items-center justify-center px-4 text-center">
                  <p className="font-medium text-sm">还没有题目</p>
                  <p className="mt-1 text-muted-foreground text-xs">从左侧选择题目类型开始创建。</p>
                </CardContent>
              </Card>
            )}
          </div>
        </aside>
      </div>

      <AlertDialog
        onOpenChange={(open) => !open && setPendingDeleteQuestionId(null)}
        open={pendingDeleteQuestion !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这道题目？</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteQuestion?.label?.trim()
                ? `将删除「${pendingDeleteQuestion.label.trim()}」。`
                : "将删除这道未命名题目。"}
              删除后不会提交保存，关闭弹窗前仍可取消本次编辑。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveQuestion} variant="destructive">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function QuestionCanvasCard({
  question,
  index,
  handleProps,
  isActive,
  isDragging,
  onRemove,
  onSelect,
}: {
  question: CandidateFormQuestionInput;
  index: number;
  // oxlint-disable-next-line no-explicit-any
  handleProps: any;
  isActive: boolean;
  isDragging: boolean;
  onRemove?: () => void;
  onSelect: () => void;
}) {
  function handleDragHandleClick(event: MouseEvent<HTMLButtonElement>) {
    handleProps.onClick?.(event);
    event.stopPropagation();
  }

  function handleDragHandleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    handleProps.onKeyDown?.(event);
    event.stopPropagation();
  }

  function handleRemoveClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onRemove?.();
  }

  return (
    // The preview item contains the drag-handle button, so the selectable
    // region stays on a div with button semantics instead of nesting buttons.
    // oxlint-disable-next-line jsx-a11y(prefer-tag-over-role)
    <div
      aria-label={`配置第 ${index + 1} 题`}
      className={cn(
        "group -mx-2 cursor-pointer rounded-lg p-2 transition-colors",
        isActive ? "bg-primary/5 ring-2 ring-primary/20" : "hover:bg-muted/40",
        isDragging ? "opacity-80 shadow-md" : "",
      )}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-start gap-2.5">
        <SortableDragHandle
          {...handleProps}
          aria-label={`拖动以调整第 ${index + 1} 题的顺序`}
          className="size-8 opacity-45 transition-opacity group-hover:opacity-100"
          onClick={handleDragHandleClick}
          onKeyDown={handleDragHandleKeyDown}
        />
        <div className="min-w-0 flex-1">
          <Field>
            <FieldLabel htmlFor={`preview-${question.id}`}>
              <span className="mr-1 text-muted-foreground">{index + 1}.</span>
              {question.label || "未命名题目"}
              {question.required ? <span className="ml-1 text-destructive">*</span> : null}
            </FieldLabel>
            <FieldContent className="gap-2">
              {question.helperText ? (
                <p className="text-muted-foreground text-xs">{question.helperText}</p>
              ) : null}
              <QuestionPreview question={question} />
            </FieldContent>
            <span className="sr-only">
              {QUESTION_TYPE_LABELS[question.type]}，{DISPLAY_MODE_LABELS[question.displayMode]}
            </span>
          </Field>
        </div>
        <Button
          aria-label={`删除第 ${index + 1} 题`}
          className="size-8 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
          disabled={!onRemove}
          onClick={handleRemoveClick}
          onKeyDown={(event) => event.stopPropagation()}
          size="icon"
          type="button"
          variant="ghost"
        >
          <IconTrash className="size-4" />
        </Button>
      </div>
    </div>
  );
}
