"use client";

import { IconPlus, IconTrash } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import {
  Select,
  SelectContent,
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
} from "@arc/db-schema/interview-question-templates";
import type { InterviewQuestionTemplateDifficulty } from "@arc/db-schema/interview-question-templates";
import { DIFFICULTY_PILL_CLASS } from "@arc/shared/interview-question-difficulty";
import { cn } from "@arc/shared/utils";
import { z } from "zod";
import { hasFieldErrors, toFieldErrors } from "./interviews/interview-form";

const DIFFICULTY_PILL = {
  easy: `${DIFFICULTY_PILL_CLASS.easy} hover:bg-emerald-500/15`,
  hard: `${DIFFICULTY_PILL_CLASS.hard} hover:bg-rose-500/15`,
  medium: `${DIFFICULTY_PILL_CLASS.medium} hover:bg-amber-500/15`,
} satisfies Record<InterviewQuestionTemplateDifficulty, string>;

interface SortableQuestionListItem {
  difficulty: InterviewQuestionTemplateDifficulty;
  evaluationFocus: string | null;
  followUpDirections: string | null;
  content?: string;
  id?: string;
  order?: number;
  question?: string;
  sortOrder?: number;
}

const sortableQuestionListItemStateSchema = z.object({
  difficulty: interviewQuestionTemplateDifficultySchema.optional(),
});

interface SortableQuestionListEditorProps {
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
  form,
  arrayFieldName,
  contentFieldName,
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
                <div
                  className={cn(
                    "group relative flex flex-col gap-2 rounded-xl border bg-card/30 p-3 transition-colors",
                    "hover:bg-card/60 focus-within:bg-card/60",
                    isDragging
                      ? "border-primary/30 bg-card"
                      : "border-border hover:border-border focus-within:border-border",
                  )}
                >
                  {/* Top: drag handle, index, difficulty, delete */}
                  <div className="flex items-center gap-2">
                    <SortableDragHandle
                      {...handleProps}
                      aria-label={`拖动以调整第 ${index + 1} 题的顺序`}
                      className="-ml-1 size-7 opacity-50 transition-opacity group-hover:opacity-100"
                    />
                    <span className="font-medium font-mono text-[11px] text-muted-foreground/80 tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="ml-auto flex items-center gap-0.5">
                      <form.Field name={`${arrayFieldName}[${index}].difficulty`}>
                        {/* oxlint-disable-next-line no-explicit-any */}
                        {(subField: any) => {
                          const parsedDifficulty =
                            interviewQuestionTemplateDifficultySchema.safeParse(
                              subField.state.value,
                            );
                          const value = parsedDifficulty.success ? parsedDifficulty.data : "easy";
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
                                className={`h-7 rounded-md border-0 px-2.5 text-xs data-[size=sm]:h-7 ${DIFFICULTY_PILL[value]}`}
                                size="sm"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {INTERVIEW_QUESTION_DIFFICULTY_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
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

                  {/* Bottom: question and interview guidance fields */}
                  <form.Field name={`${arrayFieldName}[${index}].${contentFieldName}`}>
                    {/* oxlint-disable-next-line no-explicit-any */}
                    {(subField: any) => {
                      const errors = toFieldErrors(subField.state.meta.errors);
                      return (
                        <div data-invalid={hasFieldErrors(subField.state.meta.errors) || undefined}>
                          <div
                            className={cn(
                              "relative rounded-md border border-transparent transition-colors",
                              "group-hover:border-border hover:border-border focus-within:border-ring",
                              "has-[textarea:disabled]:hover:border-transparent",
                              errors?.length && "border-destructive hover:border-destructive",
                            )}
                          >
                            <TextareaControl
                              aria-invalid={!!errors?.length}
                              className="h-24 resize-none overflow-y-auto bg-transparent p-1 pb-6 text-sm shadow-none placeholder:text-muted-foreground/50 dark:bg-transparent"
                              disabled={disabled}
                              maxLength={contentMaxLength}
                              onBlur={subField.handleBlur}
                              onChange={(event) => subField.handleChange(event.target.value)}
                              placeholder={contentPlaceholder}
                              rows={2}
                              value={subField.state.value ?? ""}
                            />
                            {contentMaxLength ? (
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

                  <div className="flex flex-col gap-2">
                    <form.Field name={`${arrayFieldName}[${index}].evaluationFocus`}>
                      {/* oxlint-disable-next-line no-explicit-any */}
                      {(subField: any) => {
                        const errors = toFieldErrors(subField.state.meta.errors);
                        return (
                          <div
                            data-invalid={hasFieldErrors(subField.state.meta.errors) || undefined}
                          >
                            <label
                              className="mb-1 block font-medium text-muted-foreground text-xs"
                              htmlFor={`${arrayFieldName}-${index}-evaluationFocus`}
                            >
                              考核点
                            </label>
                            <div
                              className={cn(
                                "relative rounded-md border border-border bg-background/50 transition-colors focus-within:border-ring",
                                errors?.length &&
                                  "border-destructive focus-within:border-destructive",
                              )}
                            >
                              <TextareaControl
                                aria-invalid={!!errors?.length}
                                className="h-20 resize-none overflow-y-auto bg-transparent p-2 pb-6 text-xs shadow-none placeholder:text-muted-foreground/50 dark:bg-transparent"
                                disabled={disabled}
                                id={`${arrayFieldName}-${index}-evaluationFocus`}
                                maxLength={evaluationFocusMaxLength}
                                onBlur={subField.handleBlur}
                                onChange={(event) => subField.handleChange(event.target.value)}
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
                            data-invalid={hasFieldErrors(subField.state.meta.errors) || undefined}
                          >
                            <label
                              className="mb-1 block font-medium text-muted-foreground text-xs"
                              htmlFor={`${arrayFieldName}-${index}-followUpDirections`}
                            >
                              追问方向
                            </label>
                            <div
                              className={cn(
                                "relative rounded-md border border-border bg-background/50 transition-colors focus-within:border-ring",
                                errors?.length &&
                                  "border-destructive focus-within:border-destructive",
                              )}
                            >
                              <TextareaControl
                                aria-invalid={!!errors?.length}
                                className="h-20 resize-none overflow-y-auto bg-transparent p-2 pb-6 text-xs shadow-none placeholder:text-muted-foreground/50 dark:bg-transparent"
                                disabled={disabled}
                                id={`${arrayFieldName}-${index}-followUpDirections`}
                                maxLength={followUpDirectionsMaxLength}
                                onBlur={subField.handleBlur}
                                onChange={(event) => subField.handleChange(event.target.value)}
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
