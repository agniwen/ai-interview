"use client";

import type {
  CandidateFormTemplateListRecord,
  CandidateFormTemplateSnapshot,
} from "@/lib/candidate-forms";
import { useQuery } from "@tanstack/react-query";
import { InboxIcon, Loader2Icon } from "lucide-react";
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/time-display";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface SubmissionRow {
  id: string;
  templateId: string;
  versionId: string;
  version: number;
  interviewRecordId: string;
  candidateName: string | null;
  snapshot: CandidateFormTemplateSnapshot;
  answers: Record<string, string | string[]>;
  submittedAt: string | Date;
}

async function fetchSubmissions(templateId: string): Promise<SubmissionRow[]> {
  const response = await fetch(`/api/studio/forms/${templateId}/submissions`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error ?? "加载填写记录失败");
  }
  return (payload.submissions ?? []) as SubmissionRow[];
}

function renderAnswer(
  question: CandidateFormTemplateSnapshot["questions"][number],
  rawValue: string | string[] | undefined,
) {
  if (
    rawValue === undefined ||
    rawValue === "" ||
    (Array.isArray(rawValue) && rawValue.length === 0)
  ) {
    return <span className="text-muted-foreground italic">（未作答）</span>;
  }
  if (question.type === "multi") {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    const labels = values.map((v) => question.options.find((opt) => opt.value === v)?.label ?? v);
    return (
      <div className="flex flex-wrap gap-1">
        {labels.map((label, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: historical order is stable
          <Badge key={index} variant="secondary">
            {label}
          </Badge>
        ))}
      </div>
    );
  }
  if (question.type === "single") {
    const v = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    const label = question.options.find((opt) => opt.value === v)?.label ?? v;
    return <Badge variant="secondary">{label}</Badge>;
  }
  return (
    <p className="whitespace-pre-wrap text-sm">
      {Array.isArray(rawValue) ? rawValue.join(", ") : rawValue}
    </p>
  );
}

export function CandidateFormTemplateSubmissionsDrawer({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: CandidateFormTemplateListRecord | null;
}) {
  const { data, isLoading, isError, error } = useQuery({
    enabled: open && !!template,
    queryFn: () => {
      if (!template) {
        return Promise.resolve([]);
      }
      return fetchSubmissions(template.id);
    },
    queryKey: ["candidate-form-templates", template?.id, "submissions"],
  });

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <SheetHeader className="border-border/60 border-b px-6 pt-6 pb-4">
          <SheetTitle>填写记录</SheetTitle>
          <SheetDescription>{template ? `面试表单：${template.title}` : null}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 p-6">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm">
              <Loader2Icon className="size-4 animate-spin" />
              加载中...
            </div>
          ) : null}
          {isError ? (
            <p className="py-10 text-center text-destructive text-sm">
              {(error as Error)?.message ?? "加载失败"}
            </p>
          ) : null}
          {data && data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground text-sm">
              <InboxIcon className="size-6" />
              还没有候选人填写过这份面试表单
            </div>
          ) : null}
          {data?.map((submission) => (
            <div
              className="space-y-3 rounded-lg border border-border/60 bg-card p-4"
              key={submission.id}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{submission.candidateName ?? "未命名候选人"}</span>
                  <Badge variant="outline">v{submission.version}</Badge>
                </div>
                <span className="text-muted-foreground text-xs tabular-nums">
                  <TimeDisplay options={DATE_TIME_DISPLAY_OPTIONS} value={submission.submittedAt} />
                </span>
              </div>
              <div className="space-y-2">
                {submission.snapshot.questions.map((question) => (
                  <div className="space-y-1" key={question.id}>
                    <p className="font-medium text-sm">
                      {question.label}
                      {question.required ? <span className="ml-1 text-destructive">*</span> : null}
                    </p>
                    <div className="pl-2 text-sm">
                      {renderAnswer(question, submission.answers[question.id])}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
