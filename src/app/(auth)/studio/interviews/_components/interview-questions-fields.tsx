"use client";

import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SortableDragHandle, SortableItem, SortableList } from "@/components/ui/sortable-list";
import { useSortableItemIds } from "@/hooks/use-sortable-item-ids";
import type { InterviewFormApi } from "./interview-form";
import { hasFieldErrors, toFieldErrors } from "./interview-form";

const DIFFICULTY_OPTIONS = [
  { label: "简单", value: "easy" },
  { label: "中等", value: "medium" },
  { label: "困难", value: "hard" },
] as const;

export function InterviewQuestionsFields({
  form,
  disabled,
  resetKey,
}: {
  form: InterviewFormApi;
  disabled?: boolean;
  /**
   * Optional — pass a value that changes whenever the parent resets the form
   * (e.g. `record?.id ?? "new"`) so parallel drag ids regenerate fresh on
   * record switch. If omitted, ids stick for the component's lifetime.
   */
  resetKey?: string;
}) {
  return (
    <form.Field mode="array" name="interviewQuestions">
      {(field) => (
        // oxlint-disable-next-line no-use-before-define
        <QuestionsListBody
          disabled={disabled}
          field={field}
          form={form}
          resetKey={resetKey ?? "default"}
        />
      )}
    </form.Field>
  );
}

function QuestionsListBody({
  field,
  form,
  disabled,
  resetKey,
}: {
  // oxlint-disable-next-line no-explicit-any
  field: any;
  form: InterviewFormApi;
  disabled?: boolean;
  resetKey: string;
}) {
  const items = (field.state.value ?? []) as {
    question: string;
    difficulty: (typeof DIFFICULTY_OPTIONS)[number]["value"];
    order: number;
  }[];

  const {
    ids,
    move: moveId,
    push: pushId,
    remove: removeId,
  } = useSortableItemIds(items.length, resetKey);

  if (items.length === 0) {
    return (
      <div className="flex min-h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center">
        <p className="font-medium text-sm">暂无面试题</p>
        <p className="mt-2 max-w-md text-muted-foreground text-sm">
          上传简历后会自动生成面试题，也可以手动添加。
        </p>
        <Button
          className="mt-4"
          disabled={disabled}
          onClick={() => {
            field.pushValue({
              difficulty: "medium",
              order: 1,
              question: "",
            });
            pushId();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          添加题目
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
              {({ handleProps }) => (
                <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                  <SortableDragHandle
                    {...handleProps}
                    aria-label={`拖动以调整第 ${index + 1} 题的顺序`}
                    className="mt-1"
                  />
                  <div className="flex shrink-0 items-center pt-2 text-muted-foreground">
                    <span className="ml-1 min-w-5 text-xs">{index + 1}</span>
                  </div>

                  <div className="flex min-w-0 flex-1 gap-2">
                    <form.Field name={`interviewQuestions[${index}].question`}>
                      {(questionField) => {
                        const errors = toFieldErrors(questionField.state.meta.errors);
                        return (
                          <div
                            className="flex-1"
                            data-invalid={
                              hasFieldErrors(questionField.state.meta.errors) || undefined
                            }
                          >
                            <Input
                              aria-invalid={!!errors?.length}
                              disabled={disabled}
                              onBlur={questionField.handleBlur}
                              onChange={(event) => questionField.handleChange(event.target.value)}
                              placeholder="输入面试题目"
                              value={questionField.state.value}
                            />
                            {errors?.[0]?.message ? (
                              <p className="mt-1 text-destructive text-xs">{errors[0].message}</p>
                            ) : null}
                          </div>
                        );
                      }}
                    </form.Field>
                    <form.Field name={`interviewQuestions[${index}].difficulty`}>
                      {(difficultyField) => (
                        <Select
                          disabled={disabled}
                          onValueChange={(value) =>
                            difficultyField.handleChange(
                              value as (typeof DIFFICULTY_OPTIONS)[number]["value"],
                            )
                          }
                          value={difficultyField.state.value}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DIFFICULTY_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </form.Field>
                  </div>

                  <Button
                    className="mt-1 shrink-0"
                    disabled={disabled}
                    onClick={() => {
                      field.removeValue(index);
                      removeId(index);
                    }}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
              )}
            </SortableItem>
          );
        })}
      </SortableList>

      <Button
        className="w-full"
        disabled={disabled}
        onClick={() => {
          field.pushValue({
            difficulty: "medium",
            order: items.length + 1,
            question: "",
          });
          pushId();
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        添加题目
      </Button>
    </div>
  );
}
