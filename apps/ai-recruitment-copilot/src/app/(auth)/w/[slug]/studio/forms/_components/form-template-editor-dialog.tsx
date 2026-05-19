"use client";

import type {
  CandidateFormDisplayMode,
  CandidateFormQuestionInput,
  CandidateFormQuestionType,
  CandidateFormScope,
  CandidateFormTemplateInput,
  CandidateFormTemplateRecord,
} from "@arc/db-schema/candidate-forms";
import type { JobDescriptionListRecord } from "@/lib/shared/job-descriptions";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useForm, useStore } from "@tanstack/react-form";
import { LoaderCircleIcon, PlusIcon, XIcon } from "lucide-react";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Label } from "@/components/ui/label";
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
import {
  candidateFormTemplateSchema,
  DEFAULT_DISPLAY_MODE,
  DISPLAY_MODES_BY_TYPE,
} from "@arc/db-schema/candidate-forms";
import { useSortableItemIds } from "@/hooks/use-sortable-item-ids";
import { hasFieldErrors, toFieldErrors } from "../../interviews/_components/interview-form";

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

const TITLE_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 1000;
const QUESTION_LABEL_MAX_LENGTH = 500;
const QUESTION_HELPER_MAX_LENGTH = 500;
const OPTION_TEXT_MAX_LENGTH = 200;

function makeDefaultQuestion(sortOrder: number): CandidateFormQuestionInput {
  return {
    displayMode: DEFAULT_DISPLAY_MODE.single,
    helperText: "",
    id: crypto.randomUUID(),
    label: "",
    options: [
      { label: "选项 1", value: "option_1" },
      { label: "选项 2", value: "option_2" },
    ],
    required: true,
    sortOrder,
    type: "single",
  };
}

function defaultValues(): CandidateFormTemplateInput {
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
  open,
  onOpenChange,
  record,
  jobDescriptions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: CandidateFormTemplateRecord | null;
  jobDescriptions: JobDescriptionListRecord[];
  onSaved: () => void;
}) {
  const slug = useWorkspaceSlug();
  const isEdit = record !== null;

  const form = useForm({
    defaultValues: record ? toFormValues(record) : defaultValues(),
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

  useEffect(() => {
    if (open) {
      form.reset(record ? toFormValues(record) : defaultValues());
    }
  }, [open, record, form]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "编辑面试表单" : "新建面试表单"}
      description="候选人在面试开始前根据作用域填写该表单；提交瞬间的题目结构会被冻结为快照。"
      size="xl"
      bodyClassName="-mx-1 px-7 py-1.5 space-y-6"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            取消
          </Button>
          <Button disabled={isSubmitting} form="form-template-form" type="submit">
            {isSubmitting ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
            {isEdit ? "保存" : "创建"}
          </Button>
        </>
      }
    >
      <form
        id="form-template-form"
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
            <form.Field mode="array" name="questions">
              {(field) => {
                const items = field.state.value;
                // question.id is guaranteed non-empty (makeDefaultQuestion + toFormValues).
                const ids = items.map((q) => q.id as string);
                return (
                  <div className="space-y-3">
                    <SortableList ids={ids} onReorder={(from, to) => field.moveValue(from, to)}>
                      {items.map((item, index) => {
                        const id = item.id as string;
                        return (
                          <SortableItem id={id} key={id}>
                            {({ handleProps, isDragging }) => (
                              // oxlint-disable-next-line no-use-before-define
                              <QuestionEditorRow
                                form={form}
                                handleProps={handleProps}
                                index={index}
                                isDragging={isDragging}
                                onRemove={
                                  items.length > 1 ? () => field.removeValue(index) : undefined
                                }
                              />
                            )}
                          </SortableItem>
                        );
                      })}
                    </SortableList>
                    <Button
                      className="w-full"
                      onClick={() => field.pushValue(makeDefaultQuestion(items.length))}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <PlusIcon className="size-4" />
                      添加题目
                    </Button>
                  </div>
                );
              }}
            </form.Field>
          </div>
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

function QuestionEditorRow({
  form,
  index,
  handleProps,
  isDragging,
  onRemove,
}: {
  form: TemplateFormApi;
  index: number;
  // oxlint-disable-next-line no-explicit-any
  handleProps: any;
  isDragging: boolean;
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
    <div
      className={`space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3 ${isDragging ? "ring-2 ring-primary/50" : ""}`}
    >
      <div className="flex items-center gap-2">
        <SortableDragHandle {...handleProps} aria-label="拖动以调整题目顺序" />
        <span className="font-medium text-muted-foreground text-sm">#{index + 1}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            aria-label="删除题目"
            className="size-7"
            disabled={!onRemove}
            onClick={onRemove}
            size="icon"
            type="button"
            variant="ghost"
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
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
            {/*
              Driven directly via the form store rather than a `<form.Field>`
              so that resets triggered by the type Select (which rewrites
              displayMode in the same tick) propagate immediately — a nested
              Field's render closure can otherwise read a stale value.
            */}
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
                      <XIcon className="size-4" />
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
          <PlusIcon className="size-4" />
          添加选项
        </Button>
        <FieldError errors={errors} />
      </FieldContent>
    </Field>
  );
}
