"use client";

/**
 * 单题渲染：根据 (type, displayMode) 选择合适的输入控件。
 * Single-question renderer: picks the right input by (type, displayMode).
 *
 * 移动端在 displayMode === "select" 时切换到 `MobileChoicePicker`，提升小屏点击体验。
 * On mobile we route `select`-mode questions to `MobileChoicePicker` for better small-screen UX.
 */

import type { CandidateFormTemplateSnapshot } from "@/lib/candidate-forms";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopMultiSelect } from "./desktop-multi-select";
import { MobileChoicePicker } from "./mobile-choice-picker";
import type { AnswerValue } from "./types";

// oxlint-disable-next-line complexity -- one branch per question type/display-mode combo, all flat conditionals.
export function QuestionView({
  question,
  value,
  onChange,
  invalid,
}: {
  question: CandidateFormTemplateSnapshot["questions"][number];
  value: AnswerValue;
  onChange: (next: AnswerValue) => void;
  invalid?: boolean;
}) {
  const inputId = `q-${question.id}`;
  const invalidProp = invalid ? true : undefined;
  const isMobile = useIsMobile();

  if (
    isMobile &&
    question.displayMode === "select" &&
    (question.type === "single" || question.type === "multi")
  ) {
    return (
      <MobileChoicePicker
        inputId={inputId}
        invalid={invalid}
        onChange={onChange}
        question={question}
        value={value}
      />
    );
  }

  if (question.type === "single" && question.displayMode === "radio") {
    return (
      <RadioGroup
        aria-invalid={invalidProp}
        className={invalid ? "gap-1.5 rounded-md p-2 ring-2 ring-destructive/40" : "gap-1.5"}
        onValueChange={(next) => onChange(next)}
        value={typeof value === "string" ? value : ""}
      >
        {question.options.map((option) => (
          <Label
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-2 font-normal transition-colors hover:bg-accent has-[button[data-state=checked]]:border-primary/40 has-[button[data-state=checked]]:bg-accent/60"
            htmlFor={`${inputId}-${option.value}`}
            key={option.value}
          >
            <RadioGroupItem id={`${inputId}-${option.value}`} value={option.value} />
            <span className="flex-1">{option.label}</span>
          </Label>
        ))}
      </RadioGroup>
    );
  }
  if (question.type === "single" && question.displayMode === "select") {
    return (
      <Select
        onValueChange={(next) => onChange(next)}
        value={typeof value === "string" ? value : undefined}
      >
        <SelectTrigger aria-invalid={invalidProp} className="w-full" id={inputId}>
          <SelectValue placeholder="请选择" />
        </SelectTrigger>
        <SelectContent>
          {question.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (question.type === "multi" && question.displayMode === "checkbox") {
    const selected = new Set(Array.isArray(value) ? value : []);
    return (
      <div
        aria-invalid={invalidProp}
        className={
          invalid ? "space-y-1.5 rounded-md p-2 ring-2 ring-destructive/40" : "space-y-1.5"
        }
      >
        {question.options.map((option) => {
          const checked = selected.has(option.value);
          return (
            <Label
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-2 font-normal transition-colors hover:bg-accent has-[button[data-state=checked]]:border-primary/40 has-[button[data-state=checked]]:bg-accent/60"
              htmlFor={`${inputId}-${option.value}`}
              key={option.value}
            >
              <Checkbox
                checked={checked}
                id={`${inputId}-${option.value}`}
                onCheckedChange={(nextChecked) => {
                  const next = new Set(selected);
                  if (nextChecked) {
                    next.add(option.value);
                  } else {
                    next.delete(option.value);
                  }
                  onChange([...next]);
                }}
              />
              <span className="flex-1">{option.label}</span>
            </Label>
          );
        })}
      </div>
    );
  }
  if (question.type === "multi" && question.displayMode === "select") {
    return (
      <DesktopMultiSelect
        inputId={inputId}
        invalid={invalid}
        onChange={onChange}
        question={question}
        value={value}
      />
    );
  }
  if (question.type === "text" && question.displayMode === "textarea") {
    return (
      <Textarea
        aria-invalid={invalidProp}
        className="min-h-24"
        id={inputId}
        onChange={(event) => onChange(event.target.value)}
        placeholder="请输入你的回答"
        value={typeof value === "string" ? value : ""}
      />
    );
  }
  return (
    <Input
      aria-invalid={invalidProp}
      id={inputId}
      onChange={(event) => onChange(event.target.value)}
      placeholder="请输入你的回答"
      value={typeof value === "string" ? value : ""}
    />
  );
}
