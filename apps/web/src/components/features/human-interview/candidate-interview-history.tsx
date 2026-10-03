import type { HumanInterviewCandidateHrInformationResponse } from "@app/shared/human-interview-candidate-materials";
import { useState } from "react";
import type { ReactNode } from "react";
import { EvaluationTimeline } from "./evaluation-timeline";
import type { EvaluationTimelineEntry } from "./evaluation-timeline";
import { cn } from "@app/shared/utils";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { LocalDateTimeText } from "@/components/features/display/local-date-time-text";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const HR_INFORMATION_ENTRIES = [
  ["jobMotivation", "求职动机"],
  ["availability", "当前状态与到岗"],
  ["overseasTravel", "个人情况与海外出差"],
  ["compensationExpectations", "薪酬情况与期望"],
  ["careerProgression", "绩效、加薪与晋升"],
  ["recentWork", "近期工作经历"],
  ["projectHighlights", "亮点项目"],
] as const;

const BUSINESS_EVALUATION_ENTRIES = [
  ["rating", "评级（A/B/C/D）"],
  ["overallEvaluation", "整体评价"],
  ["rolePosition", "角色定位"],
  ["salaryRecommendation", "薪资建议"],
  ["professionalSkill", "专业技能"],
  ["strengths", "优势特点"],
  ["risks", "劣势风险"],
] as const;

const OUTCOME_LABEL = { fail: "不通过", inconclusive: "待定", pass: "通过" } as const;
const OUTCOME_TEXT_COLOR = {
  fail: "text-rose-700 dark:text-rose-300",
  inconclusive: "text-amber-700 dark:text-amber-300",
  pass: "text-emerald-700 dark:text-emerald-300",
} as const;

function EvaluationTitle({ title, timestamp }: { title: string; timestamp?: string | null }) {
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
      <span>{title}</span>
      {timestamp ? (
        <span className="font-normal text-muted-foreground text-sm leading-5">
          <LocalDateTimeText value={timestamp} />
        </span>
      ) : null}
    </span>
  );
}

function RoundMetadata({
  round,
}: {
  round: HumanInterviewCandidateHrInformationResponse["previousEvaluations"][number];
}) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 pb-3 text-muted-foreground text-sm leading-6">
      <div className="flex min-w-0 items-center">
        <span className="shrink-0">面试官：</span>
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {round.submittedBy ? (
            <Avatar
              className="size-[18px]"
              generatedSize={18}
              label={`${round.submittedBy}的头像`}
              seed={`creator:${round.submittedBy}`}
            >
              {round.submittedByImage ? (
                <AvatarImage alt={round.submittedBy} src={round.submittedByImage} />
              ) : null}
            </Avatar>
          ) : null}
          <span>{round.submittedBy ?? "未记录"}</span>
        </span>
      </div>
      <p>
        面试结论：
        <span className={round.outcome ? OUTCOME_TEXT_COLOR[round.outcome] : undefined}>
          {round.outcome ? OUTCOME_LABEL[round.outcome] : "暂无结论"}
        </span>
      </p>
    </div>
  );
}

export function CandidateInterviewHistory({
  data,
  aiEvaluation,
  aiEvaluationGeneratedAt,
  status,
  resumePreview,
}: {
  aiEvaluationGeneratedAt?: string | null;
  status?: ReactNode;
  resumePreview?: ReactNode;
  aiEvaluation: ReactNode;
  data: HumanInterviewCandidateHrInformationResponse;
}) {
  const { hrInitialInformation: information, previousEvaluations } = data;
  const entries: EvaluationTimelineEntry[] = [
    ...(aiEvaluation
      ? [
          {
            id: "ai-evaluation",
            reference: true,
            timestamp: aiEvaluationGeneratedAt,
            title: "AI 评价",
          },
        ]
      : []),
    ...(information
      ? [
          {
            id: "hr-initial",
            reference: true,
            timestamp: information.generatedAt,
            title: "HR 初面",
          },
        ]
      : []),
    ...previousEvaluations.map((round) => ({
      author: round.submittedBy,
      id: round.roundId,
      outcome: round.outcome ? OUTCOME_LABEL[round.outcome] : "暂无结论",
      timestamp: round.submittedAt,
      title: round.roundLabel,
    })),
  ];
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const expanded = entries.map((entry) => entry.id).filter((id) => !collapsed.includes(id));
  return (
    <EvaluationTimeline
      entries={entries}
      onNavigate={(id) => setCollapsed((ids) => ids.filter((value) => value !== id))}
    >
      {(isMobile) => (
        <>
          {resumePreview}
          <Accordion
            className="flex flex-col gap-5 px-2 pt-2 pb-4 md:gap-0 md:px-0 md:pt-0 md:pb-8"
            value={expanded}
            onValueChange={(values) =>
              setCollapsed(entries.map((entry) => entry.id).filter((id) => !values.includes(id)))
            }
            multiple
          >
            {aiEvaluation ? (
              <AccordionItem
                className={
                  isMobile
                    ? "rounded-2xl border-b-0 bg-muted/70 p-1"
                    : "border-b border-border/60 py-3"
                }
                value="ai-evaluation"
                data-evaluation-id="ai-evaluation"
              >
                <div className={isMobile ? "contents" : "sticky top-0 z-10 bg-background"}>
                  <AccordionTrigger className="items-center rounded-lg px-4 py-3 font-semibold text-xl leading-7 hover:bg-muted md:text-lg md:hover:bg-muted/50 hover:no-underline [&>svg]:size-5 [&>svg]:translate-y-0">
                    <EvaluationTitle title="AI 评价" timestamp={aiEvaluationGeneratedAt} />
                  </AccordionTrigger>
                </div>
                <AccordionContent
                  className={isMobile ? "rounded-xl bg-card px-4 pt-4" : "px-4 pt-2"}
                >
                  {aiEvaluation}
                </AccordionContent>
              </AccordionItem>
            ) : null}
            {information ? (
              <AccordionItem
                className={
                  isMobile
                    ? "rounded-2xl border-b-0 bg-muted/70 p-1"
                    : "border-b border-border/60 py-3"
                }
                value="hr-initial"
                data-evaluation-id="hr-initial"
              >
                <div className={isMobile ? "contents" : "sticky top-0 z-10 bg-background"}>
                  <AccordionTrigger className="items-center rounded-lg px-4 py-3 font-semibold text-xl leading-7 hover:bg-muted md:text-lg md:hover:bg-muted/50 hover:no-underline [&>svg]:size-5 [&>svg]:translate-y-0">
                    <EvaluationTitle title="HR 初面" timestamp={information.generatedAt} />
                  </AccordionTrigger>
                </div>
                <AccordionContent
                  className={isMobile ? "rounded-xl bg-card px-4 pt-4" : "px-4 pt-2"}
                >
                  <div className="flex flex-col">
                    <p className="pb-3 text-muted-foreground text-sm leading-6">
                      {information.roundLabel ?? "AI 初面"}
                    </p>
                    {HR_INFORMATION_ENTRIES.map(([key, label]) => (
                      <section className="py-3" key={key}>
                        <h3 className="font-semibold text-base">{label}</h3>
                        <p
                          className={cn(
                            "mt-2 whitespace-pre-wrap text-base leading-7",
                            !information.values[key]?.trim() && "opacity-50",
                          )}
                        >
                          {information.values[key]?.trim() || "未收集到相关信息"}
                        </p>
                      </section>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ) : null}
            {previousEvaluations.map((round) => (
              <AccordionItem
                className={
                  isMobile
                    ? "rounded-2xl border-b-0 bg-muted/70 p-1"
                    : "border-b border-border/60 py-3"
                }
                data-evaluation-id={round.roundId}
                key={round.roundId}
                value={round.roundId}
              >
                <div className={isMobile ? "contents" : "sticky top-0 z-10 bg-background"}>
                  <AccordionTrigger className="items-center rounded-lg px-4 py-3 font-semibold text-xl leading-7 hover:bg-muted md:text-lg md:hover:bg-muted/50 hover:no-underline [&>svg]:size-5 [&>svg]:translate-y-0">
                    <EvaluationTitle title={round.roundLabel} timestamp={round.submittedAt} />
                  </AccordionTrigger>
                  {!isMobile && expanded.includes(round.roundId) ? (
                    <div className="px-4 pt-2">
                      <RoundMetadata round={round} />
                    </div>
                  ) : null}
                </div>
                <AccordionContent
                  className={isMobile ? "rounded-xl bg-card px-4 pt-4" : "px-4 pt-2"}
                >
                  {isMobile ? <RoundMetadata round={round} /> : null}
                  <div className="grid grid-cols-1 gap-x-6 md:grid-cols-4">
                    {BUSINESS_EVALUATION_ENTRIES.map(([key, label]) => (
                      <section
                        className={cn(
                          "min-w-0 py-3",
                          [
                            "rating",
                            "rolePosition",
                            "salaryRecommendation",
                            "professionalSkill",
                          ].includes(key)
                            ? "md:row-start-1"
                            : "md:col-span-4",
                        )}
                        key={key}
                      >
                        <h3 className="font-semibold text-base">{label}</h3>
                        {key === "overallEvaluation" ? (
                          <MarkdownView
                            className={cn(
                              "mt-2 break-words text-base leading-7",
                              !round.values[key]?.trim() && "opacity-50",
                            )}
                            content={round.values[key]?.trim() || "未提供"}
                          />
                        ) : (
                          <p
                            className={cn(
                              "mt-2 whitespace-pre-wrap break-words text-base leading-7",
                              !round.values[key]?.trim() && "opacity-50",
                            )}
                          >
                            {round.values[key]?.trim() || "未提供"}
                          </p>
                        )}
                      </section>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          {status}
        </>
      )}
    </EvaluationTimeline>
  );
}
