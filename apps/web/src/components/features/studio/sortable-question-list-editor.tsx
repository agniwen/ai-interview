"use client";

import { IconChevronDown, IconPlus, IconTrash } from "@tabler/icons-react";
import { QuestionEditorDisclosure } from "./question-editor-disclosure";
import { Button } from "@/components/ui/button";
import { cossFieldFocusClass } from "@/components/ui/coss-style";
import { FieldError } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SortableDragHandle, SortableItem, SortableList } from "@/components/ui/sortable-list";
import { TextareaControl } from "@/components/ui/textarea";
import { TextareaCounter } from "@/components/ui/textarea-counter";
import { useSortableItemIds } from "@/hooks/use-sortable-item-ids";
import {
  INTERVIEW_QUESTION_DIFFICULTY_OPTIONS,
  interviewQuestionTemplateDifficultySchema,
} from "@app/db-schema/interview-question-templates";
import type { InterviewQuestionTemplateDifficulty } from "@app/db-schema/interview-question-templates";
import {
  INTERVIEW_QUESTION_DIMENSION_OPTIONS,
  interviewQuestionDimensionSchema,
} from "@app/db-schema/interview/types";
import type { InterviewQuestionDimension } from "@app/db-schema/interview/types";
import { DIFFICULTY_PILL_CLASS } from "@app/shared/interview-question-difficulty";
import { cn } from "@app/shared/utils";
import { z } from "zod";
import { hasFieldErrors, toFieldErrors } from "./interviews/interview-form";

const DIFFICULTY_PILL = {
  easy: `${DIFFICULTY_PILL_CLASS.easy} hover:bg-green-line`,
  hard: `${DIFFICULTY_PILL_CLASS.hard} hover:bg-red-line`,
  medium: `${DIFFICULTY_PILL_CLASS.medium} hover:bg-amber-line`,
} satisfies Record<InterviewQuestionTemplateDifficulty, string>;

interface SortableQuestionListItem {
  difficulty: InterviewQuestionTemplateDifficulty;
  dimension?: InterviewQuestionDimension;
  evaluationFocus: string | null;
  followUpDirections: string | null;
  content?: string;
  id?: string;
  order?: number;
  question?: string;
  sortOrder?: number;
}

const sortableQuestionListItemStateSchema = z.object({
  content: z.string().optional(),
  difficulty: interviewQuestionTemplateDifficultySchema.optional(),
  dimension: interviewQuestionDimensionSchema.optional(),
  id: z.string().optional(),
  question: z.string().optional(),
});

interface SortableQuestionListEditorProps {
  collapsible?: boolean;
  /** tanstack-form's `useForm` return value. Loose typing on purpose — its
   * deeply-generic shape can't be reified as a prop without losing the form's
   * concrete data type. */
  // oxlint-disable-next-line no-explicit-any
  form: any;
  /** Path to the array field on the form, e.g. `"questions"` or
   * `"interviewQuestions"`. */
  arrayFieldName: string;
  /** Sub-field name on each item that stores the question text. */
  contentFieldName: string;
  /** Optional sub-field that enables the candidate-question dimension selector. */
  dimensionFieldName?: string;
  /** Stable token that changes whenever the parent resets the form so the
   * sortable id list regenerates. Pass `record?.id ?? "new"` or similar. */
  resetKey: string;
  /** Factory invoked when the user clicks "添加题目" to mint a new item. */
  createItem: (sortIndex: number) => SortableQuestionListItem;
  contentMaxLength?: number;
  contentPlaceholder?: string;
  evaluationFocusMaxLength?: number;
  followUpDirectionsMaxLength?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  disabled?: boolean;
}

export function SortableQuestionListEditor(props: SortableQuestionListEditorProps) {
  return (
    <props.form.Field mode="array" name={props.arrayFieldName}>
      {/* oxlint-disable-next-line no-explicit-any */}
      {(field: any) => (
        // oxlint-disable-next-line no-use-before-define
        <QuestionListBody field={field} {...props} />
      )}
    </props.form.Field>
  );
}

function QuestionListBody({
  field,
  collapsible = false,
  form,
  arrayFieldName,
  contentFieldName,
  dimensionFieldName,
  resetKey,
  createItem,
  contentMaxLength,
  contentPlaceholder = "请输入题目内容…",
  evaluationFocusMaxLength = 500,
  followUpDirectionsMaxLength = 1000,
  emptyTitle = "暂无面试题",
  emptyDescription = "添加面试官在面试中按顺序必问的题目，可单独标注难度。",
  disabled,
}: SortableQuestionListEditorProps & {
  // oxlint-disable-next-line no-explicit-any
  field: any;
}) {
  const parsedItems = z.array(sortableQuestionListItemStateSchema).safeParse(field.state.value);
  const items = parsedItems.success ? parsedItems.data : [];
  const {
    ids,
    move: moveId,
    push: pushId,
    remove: removeId,
  } = useSortableItemIds(items.length, resetKey);

  function addItem() {
    field.pushValue(createItem(items.length));
    pushId();
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 px-6 py-10 text-center">
        <p className="font-medium text-sm">{emptyTitle}</p>
        {emptyDescription ? (
          <p className="mt-1.5 max-w-md text-muted-foreground text-xs leading-normal">
            {emptyDescription}
          </p>
        ) : null}
        <Button
          className="mt-5"
          disabled={disabled}
          onClick={addItem}
          size="sm"
          type="button"
          variant="outline"
        >
          <IconPlus className="size-4" />
          添加题目
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <SortableList
        ids={ids}
        onReorder={(from, to) => {
          field.moveValue(from, to);
          moveId(from, to);
        }}
      >
        {items.map((_item, index) => {
          const id = ids[index];
          if (!id) {
            return null;
          }
          return (
            <SortableItem disabled={disabled} id={id} key={id}>
              {({ handleProps, isDragging }) => (
                <QuestionEditorDisclosure
                  form={form}
                  fieldPrefix={`${arrayFieldName}[${index}].`}
                  enabled={collapsible}
                  initiallyOpen={!(_item.content ?? _item.question)?.trim()}
                >
                  {({ expanded, toggle, panelId }) => (
                    <div
                      className={cn(
                        "group relative flex flex-col rounded-xl p-3",
                        collapsible
                          ? "grid grid-cols-[1.25rem_1rem_1rem_minmax(0,1fr)_auto] items-start gap-x-2 bg-card text-card-foreground shadow-default"
                          : "gap-2 bg-card text-card-foreground shadow-default",
                        collapsible && expanded && "gap-y-3",
                        isDragging && "ring-1 ring-primary/30",
                      )}
                    >
                      {/* Top: drag handle, index, difficulty, delete */}
                      <div className={collapsible ? "contents" : "flex items-start gap-2"}>
                        <SortableDragHandle
                          {...handleProps}
                          aria-label={`拖动以调整第 ${index + 1} 题的顺序`}
                          className={cn(
                            "col-start-1 row-start-1 -ml-1 size-7 shrink-0 opacity-50 transition-opacity group-hover:opacity-100",
                            collapsible && "mt-0.75",
                          )}
                        />
                        <span
                          className={cn(
                            "col-start-2 row-start-1 flex h-7 shrink-0 items-center font-medium font-mono text-[11px] text-muted-foreground/80 tabular-nums",
                            collapsible && "mt-0.75",
                          )}
                        >
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        {collapsible ? (
                          <form.Subscribe
                            selector={(state: {
                              values: Record<string, Record<string, string>[]>;
                            }) => state.values[arrayFieldName]?.[index]?.[contentFieldName] ?? ""}
                          >
                            {(content: string) => (
                              <button
                                type="button"
                                aria-expanded={expanded}
                                aria-controls={`${panelId}-question ${panelId}`}
                                aria-label={`${expanded ? "收起" : "展开"}第 ${index + 1} 题`}
                                onClick={toggle}
                                className={cn(
                                  "col-start-3 row-start-1 flex min-w-0 items-start gap-2 rounded-md py-1 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  !expanded && "col-span-2",
                                )}
                              >
                                <IconChevronDown
                                  className={cn(
                                    "mt-[5px] size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
                                    expanded && "rotate-180",
                                  )}
                                />
                                {expanded ? null : (
                                  <span className="min-w-0 px-[9px] py-px whitespace-pre-wrap leading-6 wrap-anywhere">
                                    {content.trim() || "未命名题目"}
                                  </span>
                                )}
                              </button>
                            )}
                          </form.Subscribe>
                        ) : null}
                        <div
                          className={cn(
                            "col-start-5 row-start-1 ml-auto flex shrink-0 items-center gap-1",
                            collapsible && "mt-0.75",
                          )}
                        >
                          {dimensionFieldName ? (
                            <form.Field name={`${arrayFieldName}[${index}].${dimensionFieldName}`}>
                              {/* oxlint-disable-next-line no-explicit-any */}
                              {(subField: any) => {
                                const parsedDimension = interviewQuestionDimensionSchema.safeParse(
                                  subField.state.value,
                                );
                                const value = parsedDimension.success
                                  ? parsedDimension.data
                                  : "business";
                                return (
                                  <Select
                                    disabled={disabled}
                                    onValueChange={(next) => {
                                      const nextDimension =
                                        interviewQuestionDimensionSchema.safeParse(next);
                                      if (nextDimension.success) {
                                        subField.handleChange(nextDimension.data);
                                      }
                                    }}
                                    value={value}
                                  >
                                    <SelectTrigger
                                      aria-label={`第 ${index + 1} 题维度`}
                                      className="h-7 rounded-md px-2.5 text-xs data-[size=sm]:h-7"
                                      size="sm"
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectGroup>
                                        {INTERVIEW_QUESTION_DIMENSION_OPTIONS.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectGroup>
                                    </SelectContent>
                                  </Select>
                                );
                              }}
                            </form.Field>
                          ) : null}
                          <form.Field name={`${arrayFieldName}[${index}].difficulty`}>
                            {/* oxlint-disable-next-line no-explicit-any */}
                            {(subField: any) => {
                              const parsedDifficulty =
                                interviewQuestionTemplateDifficultySchema.safeParse(
                                  subField.state.value,
                                );
                              const value = parsedDifficulty.success
                                ? parsedDifficulty.data
                                : "easy";
                              return (
                                <Select
                                  disabled={disabled}
                                  onValueChange={(next) => {
                                    const nextDifficulty =
                                      interviewQuestionTemplateDifficultySchema.safeParse(next);
                                    if (nextDifficulty.success) {
                                      subField.handleChange(nextDifficulty.data);
                                    }
                                  }}
                                  value={value}
                                >
                                  <SelectTrigger
                                    aria-label={`第 ${index + 1} 题难度`}
                                    className={`h-7 rounded-md border-0 px-2.5 text-xs data-[size=sm]:h-7 ${DIFFICULTY_PILL[value]}`}
                                    size="sm"
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectGroup>
                                      {INTERVIEW_QUESTION_DIFFICULTY_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                              );
                            }}
                          </form.Field>

                          <Button
                            aria-label={`删除第 ${index + 1} 题`}
                            className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            disabled={disabled}
                            onClick={() => {
                              field.removeValue(index);
                              removeId(index);
                            }}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <IconTrash className="size-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div
                        id={`${panelId}-question`}
                        hidden={!expanded}
                        className={collapsible ? "col-start-4 row-start-1 min-w-0" : ""}
                      >
                        {/* Keep fields mounted so collapsing preserves form registration and validation. */}
                        <form.Field name={`${arrayFieldName}[${index}].${contentFieldName}`}>
                          {/* oxlint-disable-next-line no-explicit-any */}
                          {(subField: any) => {
                            const errors = toFieldErrors(subField.state.meta.errors);
                            return (
                              <div
                                data-invalid={
                                  hasFieldErrors(subField.state.meta.errors) || undefined
                                }
                              >
                                <div
                                  className={cn(
                                    "relative rounded-md border border-transparent transition-[border-color,box-shadow]",
                                    !collapsible && "group-hover:border-border hover:border-border",
                                    collapsible && "border-border bg-background",
                                    cossFieldFocusClass,
                                    "has-[textarea:disabled]:hover:border-transparent",
                                    errors?.length && "border-destructive hover:border-destructive",
                                  )}
                                >
                                  <TextareaControl
                                    aria-invalid={!!errors?.length}
                                    aria-label={`第 ${index + 1} 题题干`}
                                    className={cn(
                                      "resize-none bg-transparent text-sm shadow-none placeholder:text-muted-foreground/50 dark:bg-transparent",
                                      collapsible
                                        ? "h-auto max-h-60 min-h-0 overflow-y-auto px-2 py-1 leading-6"
                                        : "h-24 overflow-y-auto p-1 pb-6",
                                    )}
                                    disabled={disabled}
                                    maxLength={contentMaxLength}
                                    onBlur={subField.handleBlur}
                                    onChange={(event) => subField.handleChange(event.target.value)}
                                    placeholder={contentPlaceholder}
                                    rows={collapsible ? 1 : 2}
                                    value={subField.state.value ?? ""}
                                  />
                                  {contentMaxLength && !collapsible ? (
                                    <TextareaCounter
                                      maxLength={contentMaxLength}
                                      value={subField.state.value}
                                    />
                                  ) : null}
                                </div>
                                <FieldError errors={errors} />
                              </div>
                            );
                          }}
                        </form.Field>
                      </div>
                      <div
                        id={panelId}
                        hidden={!expanded}
                        className={collapsible ? "col-start-4 row-start-2 min-w-0" : ""}
                      >
                        <div className="flex flex-col gap-3">
                          <form.Field name={`${arrayFieldName}[${index}].evaluationFocus`}>
                            {/* oxlint-disable-next-line no-explicit-any */}
                            {(subField: any) => {
                              const errors = toFieldErrors(subField.state.meta.errors);
                              return (
                                <div
                                  data-invalid={
                                    hasFieldErrors(subField.state.meta.errors) || undefined
                                  }
                                >
                                  <label
                                    className="mb-1 block font-medium text-muted-foreground text-xs"
                                    htmlFor={`${arrayFieldName}-${index}-evaluationFocus`}
                                  >
                                    考核点
                                  </label>
                                  <div
                                    className={cn(
                                      "relative rounded-md border border-border bg-background transition-[border-color,box-shadow]",
                                      cossFieldFocusClass,
                                      errors?.length && "border-destructive",
                                    )}
                                  >
                                    <TextareaControl
                                      aria-invalid={!!errors?.length}
                                      className="h-20 resize-none overflow-y-auto bg-transparent p-2 pb-6 text-sm leading-6 shadow-none placeholder:text-muted-foreground/50 dark:bg-transparent"
                                      disabled={disabled}
                                      id={`${arrayFieldName}-${index}-evaluationFocus`}
                                      maxLength={evaluationFocusMaxLength}
                                      onBlur={subField.handleBlur}
                                      onChange={(event) =>
                                        subField.handleChange(event.target.value)
                                      }
                                      placeholder="例如：验证项目真实性和技术深度"
                                      rows={2}
                                      value={subField.state.value ?? ""}
                                    />
                                    <TextareaCounter
                                      maxLength={evaluationFocusMaxLength}
                                      value={subField.state.value}
                                    />
                                  </div>
                                  <FieldError errors={errors} />
                                </div>
                              );
                            }}
                          </form.Field>

                          <form.Field name={`${arrayFieldName}[${index}].followUpDirections`}>
                            {/* oxlint-disable-next-line no-explicit-any */}
                            {(subField: any) => {
                              const errors = toFieldErrors(subField.state.meta.errors);
                              return (
                                <div
                                  data-invalid={
                                    hasFieldErrors(subField.state.meta.errors) || undefined
                                  }
                                >
                                  <label
                                    className="mb-1 block font-medium text-muted-foreground text-xs"
                                    htmlFor={`${arrayFieldName}-${index}-followUpDirections`}
                                  >
                                    追问方向
                                  </label>
                                  <div
                                    className={cn(
                                      "relative rounded-md border border-border bg-background transition-[border-color,box-shadow]",
                                      cossFieldFocusClass,
                                      errors?.length && "border-destructive",
                                    )}
                                  >
                                    <TextareaControl
                                      aria-invalid={!!errors?.length}
                                      className="h-20 resize-none overflow-y-auto bg-transparent p-2 pb-6 text-sm leading-6 shadow-none placeholder:text-muted-foreground/50 dark:bg-transparent"
                                      disabled={disabled}
                                      id={`${arrayFieldName}-${index}-followUpDirections`}
                                      maxLength={followUpDirectionsMaxLength}
                                      onBlur={subField.handleBlur}
                                      onChange={(event) =>
                                        subField.handleChange(event.target.value)
                                      }
                                      placeholder="例如：追问具体负责范围、关键取舍、失败复盘"
                                      rows={2}
                                      value={subField.state.value ?? ""}
                                    />
                                    <TextareaCounter
                                      maxLength={followUpDirectionsMaxLength}
                                      value={subField.state.value}
                                    />
                                  </div>
                                  <FieldError errors={errors} />
                                </div>
                              );
                            }}
                          </form.Field>
                        </div>
                      </div>
                    </div>
                  )}
                </QuestionEditorDisclosure>
              )}
            </SortableItem>
          );
        })}
      </SortableList>

      <Button
        className="w-full border-dashed text-muted-foreground hover:text-foreground"
        disabled={disabled}
        onClick={addItem}
        size="sm"
        type="button"
        variant="outline"
      >
        <IconPlus className="size-4" />
        添加题目
      </Button>
    </div>
  );
}
