import type { HumanInterviewCandidateHrInformationResponse } from "@app/shared/human-interview-candidate-materials";
import { Fragment } from "react";
import type { ReactNode } from "react";
import { LocalDateTimeText } from "@/components/features/display/local-date-time-text";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";

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
  ["seniorityPosition", "职级定位"],
  ["rolePosition", "角色定位"],
  ["professionalSkill", "专业技能"],
  ["strengths", "优势特点"],
  ["risks", "劣势风险"],
  ["salaryRecommendation", "薪资建议"],
] as const;

const OUTCOME_LABEL = { fail: "不通过", inconclusive: "暂无结论", pass: "通过" } as const;

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

export function CandidateInterviewHistory({
  data,
  aiEvaluation,
  aiEvaluationGeneratedAt,
}: {
  aiEvaluationGeneratedAt?: string | null;
  aiEvaluation: ReactNode;
  data: HumanInterviewCandidateHrInformationResponse;
}) {
  const { hrInitialInformation: information, previousEvaluations } = data;
  return (
    <Accordion
      className="space-y-3 px-2 pb-4 md:px-3"
      defaultValue={[
        ...previousEvaluations.map((round) => round.roundId),
        "hr-initial",
        "ai-evaluation",
      ]}
      multiple
    >
      {previousEvaluations.toReversed().map((round) => (
        <AccordionItem className="border-b-0" key={round.roundId} value={round.roundId}>
          <AccordionTrigger className="items-center rounded-lg px-4 py-3 font-semibold text-xl leading-7 hover:bg-muted hover:no-underline [&>svg]:size-5 [&>svg]:translate-y-0">
            <EvaluationTitle title={round.roundLabel} timestamp={round.submittedAt} />
          </AccordionTrigger>
          <AccordionContent className="px-4 pt-4">
            <div className="flex flex-wrap gap-x-6 gap-y-1 pb-3 text-muted-foreground text-sm leading-6">
              <p>面试官：{round.submittedBy ?? "未记录"}</p>
              <p>面试结论：{round.outcome ? OUTCOME_LABEL[round.outcome] : "暂无结论"}</p>
            </div>
            <Separator />
            {BUSINESS_EVALUATION_ENTRIES.map(([key, label], index) => (
              <Fragment key={key}>
                <section className="py-3">
                  <h3 className="font-semibold text-base">{label}</h3>
                  <p className="mt-2 whitespace-pre-wrap break-words text-base leading-7">
                    {round.values[key]?.trim() || "未提供"}
                  </p>
                </section>
                {index < BUSINESS_EVALUATION_ENTRIES.length - 1 ? <Separator /> : null}
              </Fragment>
            ))}
          </AccordionContent>
        </AccordionItem>
      ))}
      {information ? (
        <AccordionItem className="border-b-0" value="hr-initial">
          <AccordionTrigger className="items-center rounded-lg px-4 py-3 font-semibold text-xl leading-7 hover:bg-muted hover:no-underline [&>svg]:size-5 [&>svg]:translate-y-0">
            <EvaluationTitle title="HR 初面" timestamp={information.generatedAt} />
          </AccordionTrigger>
          <AccordionContent className="px-4 pt-4">
            <div className="flex flex-col">
              <p className="pb-3 text-muted-foreground text-sm leading-6">
                {information.roundLabel ?? "AI 初面"}
              </p>
              <Separator />
              {HR_INFORMATION_ENTRIES.map(([key, label], index) => (
                <Fragment key={key}>
                  <section className="py-3">
                    <h3 className="font-semibold text-base">{label}</h3>
                    <p className="mt-2 whitespace-pre-wrap text-base leading-7">
                      {information.values[key] ?? "未收集到相关信息"}
                    </p>
                  </section>
                  {index < HR_INFORMATION_ENTRIES.length - 1 ? <Separator /> : null}
                </Fragment>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      ) : null}
      {aiEvaluation ? (
        <AccordionItem className="border-b-0" value="ai-evaluation">
          <AccordionTrigger className="items-center rounded-lg px-4 py-3 font-semibold text-xl leading-7 hover:bg-muted hover:no-underline [&>svg]:size-5 [&>svg]:translate-y-0">
            <EvaluationTitle title="AI 评价" timestamp={aiEvaluationGeneratedAt} />
          </AccordionTrigger>
          <AccordionContent className="px-4 pt-4">{aiEvaluation}</AccordionContent>
        </AccordionItem>
      ) : null}
    </Accordion>
  );
}
