import { Button } from "@mastra/playground-ui/components/Button";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import { CircleSlashIcon, ExternalLinkIcon } from "lucide-react";

export const NoProcessorsInfo = () => (
  <div className="flex h-full items-center justify-center">
    <EmptyState
      iconSlot={<CircleSlashIcon />}
      titleSlot="暂无处理器"
      descriptionSlot="配置处理器。为智能体添加输入或输出处理器以转换消息。"
      actionSlot={
        <Button
          variant="ghost"
          as="a"
          href="https://mastra.ai/docs/agents/processors"
          target="_blank"
          rel="noopener noreferrer"
        >
          处理器文档 <ExternalLinkIcon />
        </Button>
      }
    />
  </div>
);
