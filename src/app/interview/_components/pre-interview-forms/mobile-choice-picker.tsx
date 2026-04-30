"use client";

/**
 * 移动端选项选择器：原生 `<Select>` 和内联列表在小屏上空间紧张，
 * 此处改为底部抽屉 + 全宽点击区，单选 / 多选共用一套交互。
 *
 * Mobile-friendly choice picker: native `<Select>` and inline lists feel cramped
 * on phones, so we use a bottom drawer with full-width tap targets — single and
 * multi share the same interaction.
 */

import type { CandidateFormTemplateSnapshot } from "@/lib/candidate-forms";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import type { AnswerValue } from "./types";

export function MobileChoicePicker({
  question,
  value,
  onChange,
  invalid,
  inputId,
}: {
  question: CandidateFormTemplateSnapshot["questions"][number];
  value: AnswerValue;
  onChange: (next: AnswerValue) => void;
  invalid?: boolean;
  inputId: string;
}) {
  const isMulti = question.type === "multi";
  const selectedValues = useMemo(() => {
    if (isMulti) {
      return new Set(Array.isArray(value) ? value : []);
    }
    const single = Array.isArray(value) ? (value[0] ?? "") : value;
    return new Set(single ? [single] : []);
  }, [isMulti, value]);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Set<string>>(selectedValues);

  // Sync the in-drawer draft whenever the drawer opens (or external value changes
  // while it's closed) so the user always starts from the current state.
  // 抽屉打开（或关闭期间外部值变化）时把 draft 同步到当前值，确保用户从最新状态开始。
  useEffect(() => {
    if (!open) {
      setDraft(selectedValues);
    }
  }, [open, selectedValues]);

  const triggerLabel = useMemo(() => {
    if (selectedValues.size === 0) {
      return "请选择";
    }
    return question.options
      .filter((option) => selectedValues.has(option.value))
      .map((option) => option.label)
      .join("、");
  }, [question.options, selectedValues]);

  return (
    <Drawer onOpenChange={setOpen} open={open}>
      <button
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm shadow-xs transition-[color,box-shadow]",
          "data-[invalid=true]:border-destructive data-[invalid=true]:ring-[3px] data-[invalid=true]:ring-destructive/20",
          "focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50",
        )}
        data-invalid={invalid ? true : undefined}
        id={inputId}
        onClick={() => setOpen(true)}
        type="button"
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            selectedValues.size === 0 ? "text-muted-foreground" : "",
          )}
        >
          {triggerLabel}
        </span>
        <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
      </button>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{isMulti ? "多选" : "单选"}</Badge>
            {question.required ? <span className="text-destructive text-xs">必填</span> : null}
          </div>
          <DrawerTitle className="leading-snug">{question.label}</DrawerTitle>
          {question.helperText ? (
            <DrawerDescription>{question.helperText}</DrawerDescription>
          ) : null}
        </DrawerHeader>
        <div className="max-h-[55vh] overflow-y-auto px-4 pb-2">
          <div className="flex flex-col gap-1.5">
            {question.options.map((option) => {
              const checked = draft.has(option.value);
              return (
                <button
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    checked
                      ? "border-primary/50 bg-accent/60"
                      : "border-transparent hover:bg-accent",
                  )}
                  key={option.value}
                  onClick={() => {
                    if (isMulti) {
                      const next = new Set(draft);
                      if (checked) {
                        next.delete(option.value);
                      } else {
                        next.add(option.value);
                      }
                      setDraft(next);
                    } else {
                      // Single-choice: replace draft so the confirm button commits
                      // the freshly tapped option.
                      // 单选：直接替换 draft，确认按钮会提交最新点击的那一项。
                      setDraft(new Set([option.value]));
                    }
                  }}
                  type="button"
                >
                  <span className="flex-1">{option.label}</span>
                  {checked ? <CheckIcon className="size-4 shrink-0 text-primary" /> : null}
                </button>
              );
            })}
          </div>
        </div>
        <DrawerFooter>
          <Button
            onClick={() => {
              if (isMulti) {
                onChange([...draft]);
              } else {
                const [next] = [...draft];
                onChange(next ?? "");
              }
              setOpen(false);
            }}
            size="lg"
            type="button"
          >
            确认
          </Button>
          <DrawerClose asChild>
            <Button size="lg" type="button" variant="outline">
              取消
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
