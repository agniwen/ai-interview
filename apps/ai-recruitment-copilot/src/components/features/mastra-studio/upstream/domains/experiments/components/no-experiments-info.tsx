import { Button } from "@mastra/playground-ui/components/Button";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import { CircleSlashIcon, ExternalLinkIcon } from "lucide-react";

export const NoExperimentsInfo = () => (
  <div className="flex h-full items-center justify-center">
    <EmptyState
      iconSlot={<CircleSlashIcon />}
      titleSlot="暂无实验"
      descriptionSlot={
        <>
          从数据集运行实验，以评估 <br />
          智能体和工作流。
        </>
      }
      actionSlot={
        <div className="flex flex-col items-center gap-2">
          <Button
            variant="ghost"
            as="a"
            href="https://mastra.ai/en/docs/evals/datasets/running-experiments"
            target="_blank"
            rel="noopener noreferrer"
          >
            实验文档 <ExternalLinkIcon />
          </Button>
        </div>
      }
    />
  </div>
);
