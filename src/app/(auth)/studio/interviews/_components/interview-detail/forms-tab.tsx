import type { CandidateFormSubmissionWithSnapshot } from "@/lib/candidate-forms";
import { RotateCcwIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
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

type FormQuestion = CandidateFormSubmissionWithSnapshot["snapshot"]["questions"][number];

/**
 * 只读模式下的候选人答题渲染：根据题目的 type / displayMode 走不同分支。
 * Read-only rendering of a candidate's answer; the branch depends on (type, displayMode).
 */
// oxlint-disable-next-line complexity -- one branch per (type, displayMode) combo, all flat conditionals.
function ReadOnlyAnswer({
  answer,
  inputId,
  question,
}: {
  answer: string | string[] | undefined;
  inputId: string;
  question: FormQuestion;
}) {
  const isEmpty =
    answer === undefined || answer === "" || (Array.isArray(answer) && answer.length === 0);

  if (isEmpty) {
    return <p className="text-muted-foreground text-sm italic">候选人未作答</p>;
  }

  if (question.type === "single" && question.displayMode === "radio") {
    const value = Array.isArray(answer) ? (answer[0] ?? "") : answer;
    return (
      <RadioGroup className="pointer-events-none" value={value}>
        {question.options.map((option) => (
          <div className="flex items-center gap-2" key={option.value}>
            <RadioGroupItem disabled id={`${inputId}-${option.value}`} value={option.value} />
            <Label className="font-normal" htmlFor={`${inputId}-${option.value}`}>
              {option.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
    );
  }

  if (question.type === "single" && question.displayMode === "select") {
    const value = Array.isArray(answer) ? (answer[0] ?? "") : answer;
    return (
      <Select disabled value={value}>
        <SelectTrigger className="w-full" id={inputId}>
          <SelectValue />
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
    const selected = new Set(Array.isArray(answer) ? answer : [answer]);
    return (
      <div className="space-y-2">
        {question.options.map((option) => (
          <div className="flex items-center gap-2" key={option.value}>
            <Checkbox
              checked={selected.has(option.value)}
              disabled
              id={`${inputId}-${option.value}`}
            />
            <Label className="font-normal" htmlFor={`${inputId}-${option.value}`}>
              {option.label}
            </Label>
          </div>
        ))}
      </div>
    );
  }

  if (question.type === "multi" && question.displayMode === "select") {
    const selected = new Set(Array.isArray(answer) ? answer : [answer]);
    const selectedLabels = question.options
      .filter((option) => selected.has(option.value))
      .map((option) => option.label);
    return (
      <Select disabled value={selectedLabels[0] ?? ""}>
        <SelectTrigger
          className="h-auto min-h-10 w-full items-start whitespace-normal py-2"
          id={inputId}
        >
          <span className="text-left text-sm">
            {selectedLabels.length > 0 ? selectedLabels.join("、") : "请选择"}
          </span>
        </SelectTrigger>
        <SelectContent />
      </Select>
    );
  }

  if (question.type === "text" && question.displayMode === "textarea") {
    return (
      <Textarea
        className="min-h-24"
        id={inputId}
        readOnly
        value={Array.isArray(answer) ? answer.join("\n") : answer}
      />
    );
  }

  return <Input id={inputId} readOnly value={Array.isArray(answer) ? answer.join(", ") : answer} />;
}

/**
 * 「面试表单」Tab 的内容：列出候选人提交过的所有表单快照与回答。
 * Forms tab body — lists every form snapshot the candidate submitted, with answers.
 */
export function FormsTab({
  submissions,
  resettingId,
  onReset,
}: {
  submissions: CandidateFormSubmissionWithSnapshot[];
  resettingId: string | null;
  onReset: (submissionId: string) => void;
}) {
  if (submissions.length === 0) {
    return (
      <div className="py-10 text-center text-muted-foreground text-sm">
        候选人没有填写过任何面试表单。
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {submissions.map((submission) => (
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-4" key={submission.id}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 className="font-medium text-sm">{submission.snapshot.title}</h3>
              {submission.snapshot.description ? (
                <p className="mt-1 text-muted-foreground text-xs">
                  {submission.snapshot.description}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">v{submission.version}</Badge>
              <Button
                disabled={resettingId === submission.id}
                onClick={() => onReset(submission.id)}
                size="sm"
                type="button"
                variant="outline"
              >
                <RotateCcwIcon className="size-3.5" />
                {resettingId === submission.id ? "重置中..." : "重置填写"}
              </Button>
            </div>
          </div>
          <div className="space-y-5">
            {submission.snapshot.questions.map((question, index) => (
              <Field key={question.id}>
                <FieldLabel htmlFor={`sub-${submission.id}-${question.id}`}>
                  <span className="mr-1 text-muted-foreground">{index + 1}.</span>
                  {question.label}
                  {question.required ? <span className="ml-1 text-destructive">*</span> : null}
                </FieldLabel>
                <FieldContent className="gap-2">
                  {question.helperText ? (
                    <p className="text-muted-foreground text-xs">{question.helperText}</p>
                  ) : null}
                  <ReadOnlyAnswer
                    answer={submission.answers[question.id]}
                    inputId={`sub-${submission.id}-${question.id}`}
                    question={question}
                  />
                </FieldContent>
              </Field>
            ))}
          </div>
          <p className="mt-3 text-muted-foreground text-xs">
            该记录基于 v{submission.version} 的快照；如已更新，请到「面试表单」查看当前版本。
          </p>
        </div>
      ))}
    </div>
  );
}
