import { Button } from "@mastra/playground-ui/components/Button";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import { CircleSlashIcon, ExternalLinkIcon } from "lucide-react";

export const NoToolsInfo = () => (
  <div className="flex h-full items-center justify-center">
    <EmptyState
      iconSlot={<CircleSlashIcon />}
      titleSlot="暂无工具"
      descriptionSlot={
        <>
          尚未配置 Mastra 工具。 <br />
          更多信息请参阅文档。
        </>
      }
      actionSlot={
        <Button
          variant="ghost"
          as="a"
          href="https://mastra.ai/docs/agents/using-tools-and-mcp"
          target="_blank"
          rel="noopener noreferrer"
        >
          工具文档 <ExternalLinkIcon />
        </Button>
      }
    />
  </div>
);
