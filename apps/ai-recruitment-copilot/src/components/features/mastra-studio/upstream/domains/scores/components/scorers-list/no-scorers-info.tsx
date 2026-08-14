import { Button } from "@mastra/playground-ui/components/Button";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import { CircleSlashIcon, ExternalLinkIcon } from "lucide-react";

export const NoScorersInfo = () => (
  <div className="flex h-full items-center justify-center">
    <EmptyState
      iconSlot={<CircleSlashIcon />}
      titleSlot="暂无评分器"
      descriptionSlot="请先在代码中配置评分器，详情请参阅文档。"
      actionSlot={
        <Button
          variant="ghost"
          as="a"
          href="https://mastra.ai/docs/evals/overview"
          target="_blank"
          rel="noopener noreferrer"
        >
          评分器文档 <ExternalLinkIcon />
        </Button>
      }
    />
  </div>
);
