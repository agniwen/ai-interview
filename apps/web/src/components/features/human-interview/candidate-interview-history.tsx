import type { HumanInterviewCandidateHrInformationResponse } from "@app/shared/human-interview-candidate-materials";
import { Fragment } from "react";
import { LocalDateTimeText } from "@/components/features/display/local-date-time-text";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
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

export function CandidateInterviewHistory({
  data,
}: {
  data: HumanInterviewCandidateHrInformationResponse;
}) {
  const { hrInitialInformation: information, previousEvaluations } = data;
  const latest = previousEvaluations.at(-1);
  return (
    <Accordion className="px-4" defaultValue={[latest?.roundId ?? "hr-initial"]} multiple>
      <AccordionItem value="hr-initial">
        <AccordionTrigger>HR 初面</AccordionTrigger>
        <AccordionContent>
          {information ? (
            <div className="flex flex-col">
              <p className="pb-4 text-muted-foreground text-xs leading-5">
                {information.roundLabel ?? "AI 初面"} ·{" "}
                <LocalDateTimeText value={information.generatedAt} />
              </p>
              <Separator />
              {HR_INFORMATION_ENTRIES.map(([key, label], index) => (
                <Fragment key={key}>
                  <section className="py-4">
                    <h3 className="font-medium text-sm">{label}</h3>
                    <p className="mt-2 whitespace-pre-wrap text-muted-foreground text-xs leading-5">
                      {information.values[key] ?? "未收集到相关信息"}
                    </p>
                  </section>
                  {index < HR_INFORMATION_ENTRIES.length - 1 ? <Separator /> : null}
                </Fragment>
              ))}
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>暂无 HR 初面信息</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </AccordionContent>
      </AccordionItem>
      {previousEvaluations.map((round) => (
        <AccordionItem key={round.roundId} value={round.roundId}>
          <AccordionTrigger>{round.roundLabel}</AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-2 pb-4 text-muted-foreground text-xs leading-5">
              <p>面试官：{round.submittedBy ?? "未记录"}</p>
              <p>
                提交时间：
                <LocalDateTimeText value={round.submittedAt} />
              </p>
              <p>面试结论：{round.outcome ? OUTCOME_LABEL[round.outcome] : "暂无结论"}</p>
            </div>
            <Separator />
            {BUSINESS_EVALUATION_ENTRIES.map(([key, label], index) => (
              <Fragment key={key}>
                <section className="py-4">
                  <h3 className="font-medium text-sm">{label}</h3>
                  <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground text-xs leading-5">
                    {round.values[key]?.trim() || "未提供"}
                  </p>
                </section>
                {index < BUSINESS_EVALUATION_ENTRIES.length - 1 ? <Separator /> : null}
              </Fragment>
            ))}
          </AccordionContent>
        </AccordionItem>
      ))}
      {previousEvaluations.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>暂无已提交的业务面评价</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : null}
    </Accordion>
  );
}
