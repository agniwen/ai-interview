import { Button } from "@mastra/playground-ui/components/Button";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import { CircleSlashIcon, ExternalLinkIcon } from "lucide-react";

export const NoWorkflowsInfo = () => (
  <div className="flex h-full items-center justify-center">
    <EmptyState
      iconSlot={<CircleSlashIcon />}
      titleSlot="暂无工作流"
      descriptionSlot={
        <>
          尚未配置 Mastra 工作流。 <br />
          更多信息请参阅文档。
        </>
      }
      actionSlot={
        <Button
          variant="ghost"
          as="a"
          href="https://mastra.ai/docs/workflows/overview"
          target="_blank"
          rel="noopener noreferrer"
        >
          工作流文档 <ExternalLinkIcon />
        </Button>
      }
    />
  </div>
);
