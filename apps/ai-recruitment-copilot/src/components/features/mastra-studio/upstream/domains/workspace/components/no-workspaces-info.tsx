import { Button } from "@mastra/playground-ui/components/Button";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import { CircleSlashIcon, ExternalLinkIcon } from "lucide-react";

export const NoWorkspacesInfo = () => (
  <div className="flex h-full items-center justify-center">
    <EmptyState
      iconSlot={<CircleSlashIcon />}
      titleSlot="暂无工作区"
      descriptionSlot={
        <>
          在 Mastra 配置中添加工作区，
          <br />
          以管理文件和技能并启用语义搜索。
        </>
      }
      actionSlot={
        <Button
          variant="ghost"
          as="a"
          href="https://mastra.ai/en/docs/workspace/overview"
          target="_blank"
          rel="noopener noreferrer"
        >
          工作区文档 <ExternalLinkIcon />
        </Button>
      }
    />
  </div>
);
