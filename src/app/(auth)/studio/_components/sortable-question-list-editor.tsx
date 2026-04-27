"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useSortableItemIds } from "@/hooks/use-sortable-item-ids";
import { INTERVIEW_QUESTION_DIFFICULTY_OPTIONS } from "@/lib/interview-question-templates";
import type { InterviewQuestionTemplateDifficulty } from "@/lib/interview-question-templates";
import { hasFieldErrors, toFieldErrors } from "../interviews/_components/interview-form";

const DIFFICULTY_PILL: Record<InterviewQuestionTemplateDifficulty, string> = {
  easy: "bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400",
  hard: "bg-rose-500/10 border border-rose-500/30 text-rose-700 hover:bg-rose-500/15 dark:text-rose-400",
  medium:
    "bg-amber-500/10 border border-amber-500/30 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400",
};

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
  createItem: (sortIndex: number) => Record<string, unknown>;
  contentPlaceholder?: string;
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
  contentPlaceholder = "请输入题目内容…",
  emptyTitle = "暂无面试题",
  emptyDescription = "添加面试官在面试中按顺序必问的题目，可单独标注难度。",
  disabled,
}: SortableQuestionListEditorProps & {
  // oxlint-disable-next-line no-explicit-any
  field: any;
}) {
  const items = (field.state.value ?? []) as { difficulty?: InterviewQuestionTemplateDifficulty }[];
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
      <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/10 px-6 py-10 text-center">
        <p className="font-medium text-sm">{emptyTitle}</p>
        {emptyDescription ? (
          <p className="mt-1.5 max-w-md text-muted-foreground text-xs leading-relaxed">
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
          <PlusIcon className="size-4" />
          添加题目
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
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
                  className={`group flex flex-col gap-2 rounded-xl border bg-card/30 p-3 transition-all hover:bg-card/60 ${
                    isDragging
                      ? "border-primary/30 bg-card shadow-sm"
                      : "border-border/60 hover:border-border"
                  }`}
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
                          const value =
                            (subField.state.value as InterviewQuestionTemplateDifficulty) ?? "easy";
                          return (
                            <Select
                              disabled={disabled}
                              onValueChange={(next) =>
                                subField.handleChange(next as InterviewQuestionTemplateDifficulty)
                              }
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
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Bottom: textarea only */}
                  <form.Field name={`${arrayFieldName}[${index}].${contentFieldName}`}>
                    {/* oxlint-disable-next-line no-explicit-any */}
                    {(subField: any) => {
                      const errors = toFieldErrors(subField.state.meta.errors);
                      return (
                        <div data-invalid={hasFieldErrors(subField.state.meta.errors) || undefined}>
                          <Textarea
                            aria-invalid={!!errors?.length}
                            className="min-h-14 resize-none  bg-transparent p-1 border-transparent focus:border text-sm shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0 dark:bg-transparent"
                            disabled={disabled}
                            onBlur={subField.handleBlur}
                            onChange={(event) => subField.handleChange(event.target.value)}
                            placeholder={contentPlaceholder}
                            value={subField.state.value ?? ""}
                          />
                          <FieldError errors={errors} />
                        </div>
                      );
                    }}
                  </form.Field>
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
        <PlusIcon className="size-4" />
        添加题目
      </Button>
    </div>
  );
}
