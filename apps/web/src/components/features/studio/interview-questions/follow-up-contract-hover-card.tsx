"use client";

import { IconInfoCircle } from "@tabler/icons-react";
import type { InterviewQuestionFollowUpContract } from "@app/db-schema/interview-question-templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

const SOURCE_LABEL = {
  evaluation_focus: "考核点",
  follow_up_directions: "追问方向",
  question: "题目",
} as const;

export function FollowUpContractHoverCard({
  contract,
  questionNumber,
}: {
  contract: InterviewQuestionFollowUpContract;
  questionNumber: number;
}) {
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <Button
            aria-label={`查看第 ${questionNumber} 题追问契约`}
            className="size-7 text-muted-foreground"
            size="icon"
            type="button"
            variant="ghost"
          >
            <IconInfoCircle />
          </Button>
        }
      />
      <HoverCardContent align="end" className="w-96 max-w-[calc(100vw-2rem)]" sideOffset={8}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-sm">追问契约</p>
            <Badge variant="secondary">
              {contract.coverageMode === "all_required" ? "全部收集" : "满足评估即可"}
            </Badge>
          </div>
          <ol className="flex flex-col gap-2">
            {contract.facets.map((facet) => (
              <li className="rounded-md border p-2 text-xs" key={facet.id}>
                <p className="font-medium">{facet.label}</p>
                <p className="mt-1 text-muted-foreground leading-5">
                  {SOURCE_LABEL[facet.sourceField]}：{facet.sourceText}
                </p>
                <p className="mt-1 break-all font-mono text-muted-foreground/80">{facet.id}</p>
              </li>
            ))}
          </ol>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
