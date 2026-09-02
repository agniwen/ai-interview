import type { ResumeLibraryDetail } from "@app/shared/studio-resumes";
import { Badge } from "@/components/ui/badge";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { ScrollArea } from "@/components/ui/scroll-area";

type ResumeScreeningRuleResult = NonNullable<
  ResumeLibraryDetail["resumeScreeningResult"]
>["ruleResults"][number];

function getResumeScreeningRuleStatusMeta(status: ResumeScreeningRuleResult["status"]) {
  if (status === "pass") {
    return { label: "满足", variant: "success" as const };
  }
  if (status === "fail") {
    return { label: "未满足", variant: "destructive" as const };
  }
  return { label: "待核实", variant: "warning" as const };
}

function getResumeScreeningRuleStatusOrder(status: ResumeScreeningRuleResult["status"]) {
  if (status === "pass") {
    return 0;
  }
  if (status === "fail") {
    return 1;
  }
  return 2;
}

function getResumeScreeningRuleSeverityLabel(severity: ResumeScreeningRuleResult["severity"]) {
  if (severity === "blocking") {
    return "阻断";
  }
  if (severity === "warning") {
    return "提醒";
  }
  return "信息";
}

export function ResumeScreeningResultPanel({
  resumeRecord,
}: {
  resumeRecord: ResumeLibraryDetail | null | undefined;
}) {
  const result = resumeRecord?.resumeScreeningResult;
  const recommendationMeta = {
    flag: { label: "需人工核实", variant: "warning" as const },
    hold: { label: "暂缓推进", variant: "destructive" as const },
    pass: { label: "通过", variant: "success" as const },
  };
  const sortedRuleResults =
    result?.ruleResults
      .map((rule, index) => ({ index, rule }))
      .toSorted(
        (a, b) =>
          getResumeScreeningRuleStatusOrder(a.rule.status) -
            getResumeScreeningRuleStatusOrder(b.rule.status) || a.index - b.index,
      )
      .map(({ rule }) => rule) ?? [];

  return (
    <Frame className="h-full">
      <FrameHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <FrameTitle>岗位规则检查</FrameTitle>
        <div className="flex flex-wrap gap-2">
          {result ? (
            <Badge variant={recommendationMeta[result.recommendation].variant}>
              {recommendationMeta[result.recommendation].label}
            </Badge>
          ) : null}
          {resumeRecord?.resumeScreeningStale ? <Badge variant="warning">规则已更新</Badge> : null}
        </div>
      </FrameHeader>
      <FramePanel className="flex-1">
        {resumeRecord?.resumeScreeningError ? (
          <p className="mb-4 text-destructive text-sm">{resumeRecord.resumeScreeningError}</p>
        ) : null}
        {resumeRecord?.resumeScreeningStale ? (
          <p className="mb-4 text-muted-foreground text-sm leading-6">
            当前检查结果基于旧版岗位规则生成，重新评估会同时更新规则检查和系统简历评价。
          </p>
        ) : null}
        {sortedRuleResults.length ? (
          <ScrollArea className="h-[24rem]" scrollFade>
            <ul className="divide-y divide-border/50">
              {sortedRuleResults.map((rule) => (
                <li className="py-4 text-sm leading-6" key={rule.ruleId}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getResumeScreeningRuleStatusMeta(rule.status).variant}>
                      {getResumeScreeningRuleStatusMeta(rule.status).label}
                    </Badge>
                    <Badge variant="outline">
                      {getResumeScreeningRuleSeverityLabel(rule.severity)}
                    </Badge>
                    <span className="font-medium text-sm">{rule.label}</span>
                  </div>
                  <p className="mt-2 text-muted-foreground">{rule.reason}</p>
                  {rule.evidence.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-muted-foreground text-xs">
                      {rule.evidence.slice(0, 2).map((evidence, index) => (
                        <li key={`${rule.ruleId}-${index}`}>
                          {evidence.quote ? `“${evidence.quote}”` : evidence.explanation}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </ScrollArea>
        ) : (
          <p className="flex h-[24rem] w-full min-w-0 items-center justify-center text-muted-foreground text-sm leading-6">
            {result?.policyEmpty ? "该岗位未启用具体筛选规则。" : "未评估"}
          </p>
        )}
      </FramePanel>
    </Frame>
  );
}
