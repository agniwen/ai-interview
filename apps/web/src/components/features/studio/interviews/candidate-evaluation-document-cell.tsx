import type { StudioInterviewRoundListRecord } from "@arc/shared/studio-interview-rounds";
import { IconLoader2 } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

export function CandidateEvaluationDocumentCell({
  canGenerate,
  generating,
  onGenerate,
  row,
}: {
  canGenerate: boolean;
  generating: boolean;
  onGenerate: (roundId: string) => void;
  row: StudioInterviewRoundListRecord;
}) {
  if (row.feishuDocumentUrl) {
    return (
      <a
        className="text-primary underline underline-offset-4 hover:text-primary/80"
        href={row.feishuDocumentUrl}
        onClick={(event) => event.stopPropagation()}
        rel="noopener noreferrer"
        target="_blank"
      >
        查看评价表
      </a>
    );
  }
  if (row.feishuEvaluationDocumentStatus !== "partial_answers_available") {
    return <span className="text-muted-foreground">未生成</span>;
  }

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <Button
            className="h-auto p-0"
            onClick={(event) => event.stopPropagation()}
            size="sm"
            variant="link"
          >
            可生成
          </Button>
        }
      />
      <HoverCardContent
        align="start"
        className="w-80 space-y-3"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        sideOffset={8}
      >
        <div className="space-y-1">
          <p className="font-medium text-sm">问题未完整回答</p>
          <p className="text-muted-foreground text-sm leading-5">
            最新一轮面试有问题未完成，因此系统没有自动生成评价表。你仍可以根据候选人已有回答生成。
          </p>
        </div>
        <Button
          className="w-full"
          disabled={!canGenerate || generating}
          onClick={() => onGenerate(row.id)}
          size="sm"
        >
          {generating ? <IconLoader2 className="animate-spin" /> : null}
          根据已有回答生成
        </Button>
        {canGenerate ? null : (
          <p className="text-muted-foreground text-xs">当前账号无权生成候选人评价表。</p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
