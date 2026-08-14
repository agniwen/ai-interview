import { Button } from "@mastra/playground-ui/components/Button";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import { CircleSlashIcon, ExternalLinkIcon } from "lucide-react";

export const NoAgentsInfo = () => (
  <div className="flex h-full items-center justify-center ">
    <EmptyState
      iconSlot={<CircleSlashIcon />}
      titleSlot="暂无智能体"
      descriptionSlot="在代码中配置智能体即可开始使用。"
      actionSlot={
        <Button
          variant="ghost"
          as="a"
          href="https://mastra.ai/docs/agents/overview"
          target="_blank"
          rel="noopener noreferrer"
        >
          智能体文档 <ExternalLinkIcon />
        </Button>
      }
    />
  </div>
);
