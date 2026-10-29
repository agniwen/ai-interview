"use client";

/* oxlint-disable no-use-before-define */
import { IconChevronDown, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import type {
  CandidateFormDisplayMode,
  CandidateFormQuestionInput,
  CandidateFormQuestionType,
} from "@app/db-schema/candidate-forms";
import {
  CANDIDATE_FORM_OPTION_DUPLICATE_MESSAGES,
  candidateFormDisplayModeSchema,
  candidateFormQuestionTypeSchema,
  DEFAULT_DISPLAY_MODE,
  DISPLAY_MODES_BY_TYPE,
  findDuplicateOptionIndexes,
} from "@app/db-schema/candidate-forms";
import { useStore } from "@tanstack/react-form";
import { useMemo } from "react";
import type { ComponentProps } from "react";
import { z } from "zod";
import { useSortableItemIds } from "@/hooks/use-sortable-item-ids";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SortableDragHandle, SortableItem, SortableList } from "@/components/ui/sortable-list";
import { Textarea } from "@/components/ui/textarea";
import { TextareaCounter } from "@/components/ui/textarea-counter";
import { cossFieldSurfaceClass, cossTriggerSurfaceClass } from "@/components/ui/coss-style";
import { cn } from "@app/shared/utils";
import { hasFieldErrors, toFieldErrors } from "../interviews/interview-form";

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
const optionItemsSchema = z.array(z.object({ label: z.string(), value: z.string() }));
const QUESTION_LABEL_MAX_LENGTH = 500;
const QUESTION_HELPER_MAX_LENGTH = 500;
const OPTION_TEXT_MAX_LENGTH = 200;
// oxlint-disable-next-line no-explicit-any -- TanStack Form's deeply generic instance is passed through unchanged.
type TemplateFormApi = any;

export function QuestionPreview({ question }: { question: CandidateFormQuestionInput }) {
  if (question.type === "single" && question.displayMode === "select") {
    return <PreviewSelect placeholder="请选择" />;
  }

  if (question.type === "multi" && question.displayMode === "select") {
    return <PreviewSelect placeholder="请选择，可多选" />;
  }

  if (question.type === "text") {
    if (question.displayMode === "textarea") {
      return (
        <div
          className={cn(cossFieldSurfaceClass, "min-h-24 px-3 py-2 text-muted-foreground text-sm")}
        >
          请输入你的回答…
          <span className="absolute right-3 bottom-2 text-muted-foreground/70 text-xs">0/5000</span>
        </div>
      );
    }

    return (
      <div
        className={cn(
          cossFieldSurfaceClass,
          "flex h-9 items-center px-3 text-muted-foreground text-sm",
        )}
      >
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
          className="flex min-h-11 items-center gap-3 rounded-lg border border-transparent px-3 py-2 font-normal transition-colors hover:bg-accent"
          key={option.value}
        >
          <span
            className={cn(
              "size-4 shrink-0 border border-primary/40 bg-control",
              question.type === "multi" ? "rounded-[4px]" : "rounded-full",
            )}
          />
          <span className="min-w-0 flex-1 text-sm whitespace-pre-wrap wrap-anywhere">
            {option.label || option.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function PreviewSelect({ placeholder }: { placeholder: string }) {
  return (
    <div
      className={cn(
        cossTriggerSurfaceClass,
        "flex h-10 w-full items-center justify-between rounded-lg px-3 py-2 text-muted-foreground text-sm",
      )}
    >
      <span>{placeholder}</span>
      <IconChevronDown className="size-4 shrink-0 opacity-50" />
    </div>
  );
}

export function QuestionConfigPanel({
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
    (state: any) => {
      const parsed = candidateFormQuestionTypeSchema.safeParse(
        (state.values.questions ?? [])[index]?.type,
      );
      return parsed.success ? parsed.data : "single";
    },
  );

  const questionId = useStore(
    form.store,
    // oxlint-disable-next-line no-explicit-any
    (state: any) => {
      const parsed = z.string().safeParse((state.values.questions ?? [])[index]?.id);
      return parsed.success ? parsed.data : "";
    },
  );

  const displayMode = useStore(
    form.store,
    // oxlint-disable-next-line no-explicit-any
    (state: any) => {
      const parsed = candidateFormDisplayModeSchema.safeParse(
        (state.values.questions ?? [])[index]?.displayMode,
      );
      return parsed.success ? parsed.data : DEFAULT_DISPLAY_MODE[questionType];
    },
  );

  // questionType 理论上一定是合法枚举值，但旧数据 / schema 漂移可能塞入非法字符串。
  // lookup 失败时退回 [] 让 Select 渲染空 dropdown 而不是炸掉整个题目编辑器。
  // questionType is constrained to the enum in theory, but legacy rows /
  // schema drift could leak invalid strings. Fall back to [] so the Select
  // renders an empty dropdown instead of crashing the row.
  const allowedDisplayModes = useMemo(
    () => DISPLAY_MODES_BY_TYPE[questionType] ?? [],
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
                    const parsedType = candidateFormQuestionTypeSchema.safeParse(value);
                    if (!parsedType.success) {
                      return;
                    }
                    const nextType = parsedType.data;
                    if (nextType === field.state.value) {
                      return;
                    }
                    // Type change invalidates the previous display mode and any
                    // stored options — replace the whole question atomically so
                    // sibling Field subscriptions (displayMode/options) pick up
                    // the new defaults in the same render cycle.
                    const current: CandidateFormQuestionInput | undefined = form.getFieldValue(
                      `questions[${index}]`,
                    );
                    if (!current) {
                      return;
                    }
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
                    {candidateFormQuestionTypeSchema.options.map((type) => (
                      <SelectItem key={type} value={type}>
                        {QUESTION_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
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
              onValueChange={(value) => {
                const parsed = candidateFormDisplayModeSchema.safeParse(value);
                if (parsed.success) {
                  form.setFieldValue(`questions[${index}].displayMode`, parsed.data);
                }
              }}
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
                  <Label htmlFor={`q-${index}-required`}>
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
  const parsedItems = optionItemsSchema.safeParse(field.state.value ?? []);
  const items = parsedItems.success ? parsedItems.data : [];
  const errors = toFieldErrors(field.state.meta.errors);
  const {
    ids: optionIds,
    move: moveId,
    push: pushId,
    remove: removeId,
  } = useSortableItemIds(items.length, questionId);
  // 数组字段不会因子项文字变化而重渲染，查重直接订阅本题选项的最新值。
  // The array field doesn't re-render on nested edits, so duplicate checks subscribe to live values.
  const liveOptions = useStore(
    form.store,
    // oxlint-disable-next-line no-explicit-any -- TanStack Form's deeply generic store state.
    (state: any) => state.values.questions?.[index]?.options,
  );
  const parsedLiveOptions = optionItemsSchema.safeParse(liveOptions ?? []);
  const liveItems = parsedLiveOptions.success ? parsedLiveOptions.data : items;
  const labelDuplicates = findDuplicateOptionIndexes(liveItems, "label");
  const valueDuplicates = findDuplicateOptionIndexes(liveItems, "value");

  return (
    <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
      {/* 标题行与选项行共用列宽：首列多出卡片内边距，列名正好对齐输入框。
          The header shares the option grid; its first column adds the card padding so hints align. */}
      <div className="grid grid-cols-[2.125rem_minmax(0,1fr)_8rem_2rem] items-center gap-2 pr-1.5">
        <FieldLabel className="whitespace-nowrap">选项</FieldLabel>
        <span aria-hidden className="text-muted-foreground text-xs">
          显示文字
        </span>
        <span aria-hidden className="text-muted-foreground text-xs">
          选项值
        </span>
      </div>
      <FieldContent className="gap-2">
        <SortableList
          className="space-y-2"
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
                  <OptionRow
                    canRemove={items.length > 2}
                    duplicateOf={{
                      label: labelDuplicates.get(optionIndex),
                      value: valueDuplicates.get(optionIndex),
                    }}
                    form={form}
                    handleProps={handleProps}
                    name={`questions[${index}].options[${optionIndex}]`}
                    onRemove={() => {
                      field.removeValue(optionIndex);
                      removeId(optionIndex);
                    }}
                    optionIndex={optionIndex}
                  />
                )}
              </SortableItem>
            );
          })}
        </SortableList>
        <Button
          className="self-start"
          onClick={() => {
            field.pushValue(nextDefaultOption(liveItems));
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

/** 新增选项取第一个未被占用的编号，避免删除中间项后再添加时与已有选项重复。 */
function nextDefaultOption(items: { label: string; value: string }[]) {
  const labels = new Set(items.map((item) => item.label.trim()));
  const values = new Set(items.map((item) => item.value.trim()));
  let number = items.length + 1;
  while (labels.has(`选项 ${number}`) || values.has(`option_${number}`)) {
    number += 1;
  }
  return { label: `选项 ${number}`, value: `option_${number}` };
}

const OPTION_FIELD_LABELS = { label: "显示文字", value: "选项值" } as const;

function OptionRow({
  canRemove,
  duplicateOf,
  form,
  handleProps,
  name,
  onRemove,
  optionIndex,
}: {
  canRemove: boolean;
  duplicateOf: { label: number | undefined; value: number | undefined };
  form: TemplateFormApi;
  handleProps: ComponentProps<typeof SortableDragHandle>;
  name: string;
  onRemove: () => void;
  optionIndex: number;
}) {
  // 实时提示重复；提交校验里的同类错误由实时提示代替，避免修正后仍残留旧错误。
  // Live duplicate hints replace the submit-time duplicate issue so a fixed row never keeps a stale error.
  const liveErrors = (["label", "value"] as const).flatMap((key) => {
    const firstIndex = duplicateOf[key];
    return firstIndex === undefined
      ? []
      : [{ message: `${OPTION_FIELD_LABELS[key]}与选项 ${firstIndex + 1} 重复` }];
  });
  // oxlint-disable-next-line no-explicit-any -- TanStack Form's deeply generic store state.
  const fieldErrors = useStore(form.store, (state: any) =>
    (["label", "value"] as const).flatMap((key) =>
      (toFieldErrors(state.fieldMeta[`${name}.${key}`]?.errors) ?? []).filter(
        (error) => error.message !== CANDIDATE_FORM_OPTION_DUPLICATE_MESSAGES[key],
      ),
    ),
  );
  const invalid = {
    label: duplicateOf.label !== undefined,
    value: duplicateOf.value !== undefined,
  };
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-card p-1.5 text-card-foreground shadow-default">
      <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_8rem_2rem] items-center gap-2">
        <SortableDragHandle
          {...handleProps}
          aria-label={`拖动以调整选项 ${optionIndex + 1} 的顺序`}
        />
        {(["label", "value"] as const).map((key) => (
          <form.Field key={key} name={`${name}.${key}`}>
            {/* oxlint-disable-next-line no-explicit-any */}
            {(subField: any) => (
              <Input
                aria-invalid={
                  invalid[key] || Boolean(subField.state.meta.errors?.length) || undefined
                }
                aria-label={`选项 ${optionIndex + 1} 的${OPTION_FIELD_LABELS[key]}`}
                className={key === "label" ? undefined : "font-mono text-xs"}
                maxLength={OPTION_TEXT_MAX_LENGTH}
                onBlur={subField.handleBlur}
                onChange={(event) => subField.handleChange(event.target.value)}
                placeholder={key === "label" ? "显示文字" : "value"}
                value={subField.state.value}
              />
            )}
          </form.Field>
        ))}
        <Button
          aria-label={`删除选项 ${optionIndex + 1}`}
          className="size-8 shrink-0"
          disabled={!canRemove}
          onClick={onRemove}
          size="icon"
          type="button"
          variant="ghost"
        >
          <IconX className="size-4" />
        </Button>
      </div>
      <FieldError className="px-1.5 pb-0.5 text-xs" errors={[...liveErrors, ...fieldErrors]} />
    </div>
  );
}
