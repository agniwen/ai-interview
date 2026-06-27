"use client";

import {
  IconChevronDown,
  IconCircleDot,
  IconListCheck,
  IconLoader2,
  IconPlus,
  IconSettings2,
  IconSquareCheck,
  IconTrash,
  IconTypeface,
  IconX,
} from "@tabler/icons-react";
/* oxlint-disable eslint(no-use-before-define) jsx-a11y(prefer-tag-over-role) */
/* eslint-disable no-use-before-define, jsx-a11y/prefer-tag-over-role */

import type {
  CandidateFormDisplayMode,
  CandidateFormQuestionInput,
  CandidateFormQuestionType,
  CandidateFormScope,
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
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { SortableDragHandle, SortableItem, SortableList } from "@/components/ui/sortable-list";
import { Switch } from "@/components/ui/switch";
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
  candidateFormTemplateSchema,
  DEFAULT_DISPLAY_MODE,
  DISPLAY_MODES_BY_TYPE,
} from "@arc/db-schema/candidate-forms";
import { useSortableItemIds } from "@/hooks/use-sortable-item-ids";
import { hasFieldErrors, toFieldErrors } from "../interviews/interview-form";

const DISPLAY_MODE_LABELS: Record<CandidateFormDisplayMode, string> = {
  checkbox: "复选框",
  input: "单行输入",
  radio: "单选框",
  select: "下拉选择",
  textarea: "多行输入",
};

const QUESTION_TYPE_LABELS: Record<CandidateFormQuestionType, string> = {
  multi: "多选题",
  single: "单选题",
  text: "填写题",
};

const QUESTION_TYPE_META: Record<
  CandidateFormQuestionType,
  { description: string; icon: typeof IconCircleDot }
> = {
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
};

const TITLE_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 1000;
const QUESTION_LABEL_MAX_LENGTH = 500;
const QUESTION_HELPER_MAX_LENGTH = 500;
const OPTION_TEXT_MAX_LENGTH = 200;

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
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.error(payload?.error ?? (isEdit ? "更新失败" : "创建失败"));
        return;
      }
      toast.success(isEdit ? "面试表单已更新" : "已创建面试表单");
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
    if (open) {
      form.reset(resolvedInitialValues);
      setSelectedQuestionId(resolvedInitialValues.questions[0]?.id ?? null);
    }
  }, [open, form, resolvedInitialValues]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (questionIds.length === 0) {
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
      title={isEdit ? "编辑面试表单" : "新建面试表单"}
      description="候选人在面试开始前根据作用域填写该表单；提交瞬间的题目结构会被冻结为快照。"
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
                            field.handleChange(value as CandidateFormScope);
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
    (state: any) => (state.values.questions ?? []) as CandidateFormQuestionInput[],
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
    (state: any) => (state.values.title?.trim() || "未命名面试表单") as string,
  );
  const templateDescription = useStore(
    form.store,
    // oxlint-disable-next-line no-explicit-any
    (state: any) => (state.values.description?.trim() || "") as string,
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
            {(Object.keys(QUESTION_TYPE_LABELS) as CandidateFormQuestionType[]).map((type) => {
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

function QuestionPreview({ question }: { question: CandidateFormQuestionInput }) {
  if (question.type === "single" && question.displayMode === "select") {
    return <PreviewSelect placeholder="请选择" />;
  }

  if (question.type === "multi" && question.displayMode === "select") {
    return <PreviewSelect placeholder="请选择，可多选" />;
  }

  if (question.type === "text") {
    if (question.displayMode === "textarea") {
      return (
        <div className="relative min-h-24 rounded-md border border-input bg-background px-3 py-2 text-muted-foreground text-sm shadow-xs">
          请输入你的回答…
          <span className="absolute right-3 bottom-2 text-muted-foreground/70 text-xs">0/5000</span>
        </div>
      );
    }

    return (
      <div className="flex h-9 items-center rounded-md border border-input bg-background px-3 text-muted-foreground text-sm shadow-xs">
        请输入你的回答…
      </div>
    );
  }

  if (question.options.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/20 px-3 py-3 text-muted-foreground text-xs">
        暂无选项
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {question.options.map((option) => (
        <div
          className="flex min-h-11 items-center gap-3 rounded-md border border-transparent px-3 py-2 font-normal transition-colors hover:bg-accent"
          key={option.value}
        >
          <span
            className={cn(
              "size-4 shrink-0 border border-primary/40 bg-background",
              question.type === "multi" ? "rounded-[4px]" : "rounded-full",
            )}
          />
          <span className="min-w-0 flex-1 truncate text-sm">{option.label || option.value}</span>
        </div>
      ))}
    </div>
  );
}

function PreviewSelect({ placeholder }: { placeholder: string }) {
  return (
    <div className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-muted-foreground text-sm shadow-xs">
      <span>{placeholder}</span>
      <IconChevronDown className="size-4 shrink-0 opacity-50" />
    </div>
  );
}

function QuestionConfigPanel({
  form,
  index,
  onRemove,
}: {
  form: TemplateFormApi;
  index: number;
  onRemove?: () => void;
}) {
  // form.reset / setFieldValue 把 questions 整段替换的过渡帧里，store selector 可能
  // 读到 state.values.questions === undefined 或者新数组比当前 index 短。
  // 三个 selector 都先把 questions 本身兜成 [] 再 index，再用 ?? fallback——
  // 避免抛错被 useStore 吞掉后返回上次的 stale value，进而让下游 lookup 拿到非法 key。
  // During a form.reset / setFieldValue race the questions array can briefly be
  // undefined or shorter than `index`. Default questions to [] before indexing
  // so the selector never throws (a thrown selector causes useStore to return a
  // stale value, which can later index DISPLAY_MODES_BY_TYPE with garbage).
  const questionType = useStore(
    form.store,
    // oxlint-disable-next-line no-explicit-any
    (state: any) =>
      ((state.values.questions ?? [])[index]?.type ?? "single") as CandidateFormQuestionType,
  );

  const questionId = useStore(
    form.store,
    // oxlint-disable-next-line no-explicit-any
    (state: any) => ((state.values.questions ?? [])[index]?.id ?? "") as string,
  );

  const displayMode = useStore(
    form.store,
    // oxlint-disable-next-line no-explicit-any
    (state: any) =>
      ((state.values.questions ?? [])[index]?.displayMode ??
        DEFAULT_DISPLAY_MODE[questionType]) as CandidateFormDisplayMode,
  );

  // questionType 理论上一定是合法枚举值，但旧数据 / schema 漂移可能塞入非法字符串。
  // lookup 失败时退回 [] 让 Select 渲染空 dropdown 而不是炸掉整个题目编辑器。
  // questionType is constrained to the enum in theory, but legacy rows /
  // schema drift could leak invalid strings. Fall back to [] so the Select
  // renders an empty dropdown instead of crashing the row.
  const allowedDisplayModes = useMemo(
    () => (DISPLAY_MODES_BY_TYPE[questionType] ?? []) as readonly CandidateFormDisplayMode[],
    [questionType],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-sm">第 {index + 1} 题</p>
          <p className="text-muted-foreground text-xs">编辑题干、展示方式和选项。</p>
        </div>
        <Button
          aria-label="删除题目"
          className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          disabled={!onRemove}
          onClick={onRemove}
          size="icon"
          type="button"
          variant="ghost"
        >
          <IconTrash className="size-4" />
        </Button>
      </div>

      <div className="grid gap-3">
        <form.Field name={`questions[${index}].type`}>
          {/* oxlint-disable-next-line no-explicit-any */}
          {(field: any) => (
            <Field>
              <FieldLabel>题目类型</FieldLabel>
              <FieldContent>
                <Select
                  onValueChange={(value) => {
                    const nextType = value as CandidateFormQuestionType;
                    if (nextType === field.state.value) {
                      return;
                    }
                    // Type change invalidates the previous display mode and any
                    // stored options — replace the whole question atomically so
                    // sibling Field subscriptions (displayMode/options) pick up
                    // the new defaults in the same render cycle.
                    const current = form.getFieldValue(
                      `questions[${index}]`,
                    ) as CandidateFormQuestionInput;
                    form.setFieldValue(`questions[${index}]`, {
                      ...current,
                      displayMode: DEFAULT_DISPLAY_MODE[nextType],
                      options:
                        nextType === "text"
                          ? []
                          : [
                              { label: "选项 1", value: "option_1" },
                              { label: "选项 2", value: "option_2" },
                            ],
                      type: nextType,
                    });
                  }}
                  value={field.state.value}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(QUESTION_TYPE_LABELS) as CandidateFormQuestionType[]).map(
                      (type) => (
                        <SelectItem key={type} value={type}>
                          {QUESTION_TYPE_LABELS[type]}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          )}
        </form.Field>

        <Field>
          <FieldLabel>展示方式</FieldLabel>
          <FieldContent>
            <Select
              key={questionType}
              onValueChange={(value) =>
                form.setFieldValue(
                  `questions[${index}].displayMode`,
                  value as CandidateFormDisplayMode,
                )
              }
              value={displayMode}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedDisplayModes.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {DISPLAY_MODE_LABELS[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>

        <form.Field name={`questions[${index}].required`}>
          {/* oxlint-disable-next-line no-explicit-any */}
          {(field: any) => (
            <Field className="items-start">
              <FieldLabel>必填</FieldLabel>
              <FieldContent>
                <div className="flex h-9 items-center gap-2">
                  <Switch
                    checked={field.state.value}
                    id={`q-${index}-required`}
                    onCheckedChange={(checked) => field.handleChange(checked)}
                  />
                  <Label className="text-sm" htmlFor={`q-${index}-required`}>
                    {field.state.value ? "必填" : "选填"}
                  </Label>
                </div>
              </FieldContent>
            </Field>
          )}
        </form.Field>
      </div>

      <form.Field name={`questions[${index}].label`}>
        {/* oxlint-disable-next-line no-explicit-any */}
        {(field: any) => {
          const errors = toFieldErrors(field.state.meta.errors);
          return (
            <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
              <FieldLabel>题目文本</FieldLabel>
              <FieldContent className="gap-2">
                <div className="relative">
                  <Textarea
                    aria-invalid={!!errors?.length}
                    className="max-h-40 min-h-20 resize-none pb-6"
                    maxLength={QUESTION_LABEL_MAX_LENGTH}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="请输入题目"
                    rows={3}
                    value={field.state.value}
                  />
                  <TextareaCounter
                    maxLength={QUESTION_LABEL_MAX_LENGTH}
                    value={field.state.value}
                  />
                </div>
                <FieldError errors={errors} />
              </FieldContent>
            </Field>
          );
        }}
      </form.Field>

      <form.Field name={`questions[${index}].helperText`}>
        {/* oxlint-disable-next-line no-explicit-any */}
        {(field: any) => (
          <Field>
            <FieldLabel>提示（可选）</FieldLabel>
            <FieldContent>
              <Input
                maxLength={QUESTION_HELPER_MAX_LENGTH}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="给候选人一点补充说明"
                value={field.state.value ?? ""}
              />
            </FieldContent>
          </Field>
        )}
      </form.Field>

      {questionType === "text" ? null : (
        // oxlint-disable-next-line no-use-before-define
        <OptionsEditor form={form} index={index} questionId={questionId} />
      )}
    </div>
  );
}

function OptionsEditor({
  form,
  index,
  questionId,
}: {
  form: TemplateFormApi;
  index: number;
  questionId: string;
}) {
  return (
    <form.Field mode="array" name={`questions[${index}].options`}>
      {/* oxlint-disable-next-line no-explicit-any */}
      {(field: any) => (
        // oxlint-disable-next-line no-use-before-define
        <OptionsList field={field} form={form} index={index} questionId={questionId} />
      )}
    </form.Field>
  );
}

function OptionsList({
  field,
  form,
  index,
  questionId,
}: {
  // oxlint-disable-next-line no-explicit-any
  field: any;
  form: TemplateFormApi;
  index: number;
  questionId: string;
}) {
  // tanstack-form 数组字段在 modal 关闭 / 题目类型切换的过渡帧里会短暂返回 undefined
  // （父字段 questions[index] 被整体替换时，options 子字段还在 mount 状态下抢渲染一次）。
  // 用 ?? [] 兜底避免 .length 抛错——值为 undefined 时整个 SortableList 渲染空数组也无副作用。
  // The array field briefly returns undefined during modal close / question-type
  // swap (parent questions[index] is replaced wholesale while this child field is
  // still mounted for one render). Default to [] so `.length` doesn't throw; an
  // empty SortableList renders harmlessly during that transient frame.
  const items = (field.state.value ?? []) as { value: string; label: string }[];
  const errors = toFieldErrors(field.state.meta.errors);
  const {
    ids: optionIds,
    move: moveId,
    push: pushId,
    remove: removeId,
  } = useSortableItemIds(items.length, questionId);

  return (
    <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
      <FieldLabel>选项</FieldLabel>
      <FieldContent className="gap-2">
        <SortableList
          ids={optionIds}
          onReorder={(from, to) => {
            field.moveValue(from, to);
            moveId(from, to);
          }}
        >
          {items.map((_item, optionIndex) => {
            const id = optionIds[optionIndex];
            if (!id) {
              return null;
            }
            return (
              <SortableItem id={id} key={id}>
                {({ handleProps }) => (
                  <div className="flex items-center gap-2">
                    <SortableDragHandle {...handleProps} aria-label="拖动以调整选项顺序" />
                    <form.Field name={`questions[${index}].options[${optionIndex}].label`}>
                      {/* oxlint-disable-next-line no-explicit-any */}
                      {(subField: any) => (
                        <Input
                          className="flex-1"
                          maxLength={OPTION_TEXT_MAX_LENGTH}
                          onBlur={subField.handleBlur}
                          onChange={(event) => subField.handleChange(event.target.value)}
                          placeholder="显示文字"
                          value={subField.state.value}
                        />
                      )}
                    </form.Field>
                    <form.Field name={`questions[${index}].options[${optionIndex}].value`}>
                      {/* oxlint-disable-next-line no-explicit-any */}
                      {(subField: any) => (
                        <Input
                          className="w-32 font-mono text-xs"
                          maxLength={OPTION_TEXT_MAX_LENGTH}
                          onBlur={subField.handleBlur}
                          onChange={(event) => subField.handleChange(event.target.value)}
                          placeholder="value"
                          value={subField.state.value}
                        />
                      )}
                    </form.Field>
                    <Button
                      aria-label="删除选项"
                      className="size-8 shrink-0"
                      disabled={items.length <= 2}
                      onClick={() => {
                        field.removeValue(optionIndex);
                        removeId(optionIndex);
                      }}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <IconX className="size-4" />
                    </Button>
                  </div>
                )}
              </SortableItem>
            );
          })}
        </SortableList>
        <Button
          className="self-start"
          onClick={() => {
            field.pushValue({
              label: `选项 ${items.length + 1}`,
              value: `option_${items.length + 1}`,
            });
            pushId();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <IconPlus className="size-4" />
          添加选项
        </Button>
        <FieldError errors={errors} />
      </FieldContent>
    </Field>
  );
}
