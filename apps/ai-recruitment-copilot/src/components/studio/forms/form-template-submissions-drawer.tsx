"use client";

import type {
  CandidateFormTemplateListRecord,
  CandidateFormTemplateSnapshot,
} from "@arc/db-schema/candidate-forms";
import { useInfiniteQuery } from "@tanstack/react-query";
import { InboxIcon, Loader2Icon } from "lucide-react";
import { useMemo } from "react";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/display/time-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// 跟后端 DAO 的 DEFAULT_LIMIT 保持一致，单一来源在后端，这里只是显式声明 UI 节奏。
// Mirrors the backend DAO's DEFAULT_LIMIT; the server owns the cap, this just
// names the UI cadence explicitly.
const PAGE_SIZE = 20;

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

interface SubmissionsPage {
  submissions: SubmissionRow[];
  total: number;
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
    // 未作答用比 muted-foreground 更弱的颜色 + 不斜体，避免跟"输入提示"风格混淆。
    // Use a softer-than-muted tone (no italic) so it reads as "missing data"
    // rather than UI hint copy.
    return <span className="text-muted-foreground/70 text-sm">（未作答）</span>;
  }
  if (question.type === "multi" || question.type === "single") {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    const labels = values.map((v) => question.options.find((opt) => opt.value === v)?.label ?? v);
    return (
      <div className="flex flex-wrap gap-1.5">
        {labels.map((label, index) => (
          <Badge
            // biome-ignore lint/suspicious/noArrayIndexKey: historical order is stable
            className="font-normal"
            key={index}
            variant="secondary"
          >
            {label}
          </Badge>
        ))}
      </div>
    );
  }
  // 自由文本：套一层 bg-muted/30 软容器（沿用 parsed-resume-button.tsx 里 ChipList
  // 同款底色），多行内容有视觉框，跟"标签+值"的简短回答形成分级。
  // Free-form text gets a soft container (same tonal family as the
  // chip-list background elsewhere), giving multi-line answers a visual
  // boundary that sets them apart from short option-style answers.
  return (
    <Card className="gap-0 rounded-md py-0 shadow-none">
      <CardContent className="whitespace-pre-wrap bg-muted/30 px-3 py-2 text-foreground text-sm leading-relaxed">
        {Array.isArray(rawValue) ? rawValue.join(", ") : rawValue}
      </CardContent>
    </Card>
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
  const slug = useWorkspaceSlug();

  // useInfiniteQuery：每页 20 条，pageParam = 当前 offset。getNextPageParam 累计
  // 已加载条数，达到 total 时返回 undefined 让 hasNextPage 变 false。
  // useInfiniteQuery: 20 per page; pageParam = current offset. Stops when the
  // accumulated count reaches `total` (returns undefined → hasNextPage=false).
  const { data, isLoading, isError, error, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteQuery<SubmissionsPage>({
      enabled: open && !!template,
      getNextPageParam: (lastPage, allPages) => {
        const loaded = allPages.reduce((sum, p) => sum + p.submissions.length, 0);
        return loaded < lastPage.total ? loaded : undefined;
      },
      initialPageParam: 0,
      queryFn: async ({ pageParam }) => {
        if (!template) {
          return { submissions: [], total: 0 };
        }
        const response = await rpc.api.w[":slug"].studio.forms[":id"].submissions.$get({
          param: { id: template.id, slug },
          query: { limit: String(PAGE_SIZE), offset: String(pageParam ?? 0) },
        });
        const payload = (await response.json()) as Partial<SubmissionsPage> & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload?.error ?? "加载填写记录失败");
        }
        return {
          submissions: (payload.submissions ?? []) as SubmissionRow[],
          total: payload.total ?? 0,
        };
      },
      queryKey: ["candidate-form-templates", slug, template?.id, "submissions"],
    });

  // 把所有页面拍平为单列；后端已按 submittedAt desc 排序，所以累加顺序天然正确。
  // Flatten all pages; backend already sorts by submittedAt desc so the
  // concatenation is in the correct order.
  const submissions = useMemo(() => data?.pages.flatMap((p) => p.submissions) ?? [], [data?.pages]);
  const total = data?.pages[0]?.total ?? 0;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <SheetHeader className="border-border border-b px-6 pt-6 pb-4">
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
          {!isLoading && submissions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground text-sm">
              <InboxIcon className="size-6" />
              还没有候选人填写过这份面试表单
            </div>
          ) : null}
          {submissions.map((submission) => (
            <Card className="gap-0 rounded-2xl border-border bg-card py-0" key={submission.id}>
              <CardContent className="space-y-4 p-5">
                {/* 头部：候选人名称 + 版本徽章为一级元数据；提交时间为二级元数据，
                  纵向排列让候选人姓名独占一行（长名字不会跟时间挤）。
                  Header: name + version are the primary metadata stack; submitted-at
                  is secondary, placed below so a long name no longer fights with
                  the timestamp for horizontal space. */}
                <header className="flex flex-col gap-1 border-border border-b pb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base text-foreground leading-tight">
                      {submission.candidateName ?? "未命名候选人"}
                    </h3>
                    <Badge className="font-mono text-[10px] tracking-wider" variant="outline">
                      v{submission.version}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    提交于{" "}
                    <TimeDisplay
                      options={DATE_TIME_DISPLAY_OPTIONS}
                      value={submission.submittedAt}
                    />
                  </p>
                </header>

                {/* 问答区：每题"问"作为 muted 标签 + "答"作为前景内容，
                  跟 parsed-resume-button.tsx 的 Field 风格保持一致。
                  Each Q&A pair styles "question" as a muted label and "answer"
                  as the foreground value — same hierarchy as the parsed-resume
                  Field component, so the visual language matches. */}
                <div className="space-y-3.5">
                  {submission.snapshot.questions.map((question) => (
                    <div className="space-y-1.5" key={question.id}>
                      <p className="flex items-baseline gap-1 text-muted-foreground text-xs">
                        <span>{question.label}</span>
                        {question.required ? (
                          <span aria-label="必填" className="text-destructive">
                            *
                          </span>
                        ) : null}
                      </p>
                      <div>{renderAnswer(question, submission.answers[question.id])}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          {submissions.length > 0 ? (
            <div className="flex flex-col items-center gap-2 pt-2 pb-1 text-muted-foreground text-xs">
              {hasNextPage ? (
                <Button
                  className="min-w-32"
                  disabled={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin" />
                      加载中...
                    </>
                  ) : (
                    "加载更多"
                  )}
                </Button>
              ) : (
                <span>已加载全部 {total} 条记录</span>
              )}
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
