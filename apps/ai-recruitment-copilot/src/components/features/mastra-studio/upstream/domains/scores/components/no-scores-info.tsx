import { Button } from "@mastra/playground-ui/components/Button";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import { CircleSlashIcon, ExternalLinkIcon } from "lucide-react";

export const NoScoresInfo = () => (
  <div className="flex h-full items-center justify-center">
    <EmptyState
      iconSlot={<CircleSlashIcon />}
      titleSlot="暂无得分"
      descriptionSlot="评分器评估智能体或工作流后，得分将显示在此处。详情请参阅文档。"
      actionSlot={
        <Button
          variant="ghost"
          as="a"
          href="https://mastra.ai/en/docs/evals/overview"
          target="_blank"
          rel="noopener noreferrer"
        >
          评分器文档 <ExternalLinkIcon />
        </Button>
      }
    />
  </div>
);
