import { Button } from "@mastra/playground-ui/components/Button";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import { CircleAlertIcon, ExternalLinkIcon } from "lucide-react";

export const WorkspaceNotSupported = () => (
  <div className="flex h-full items-center justify-center">
    <EmptyState
      iconSlot={<CircleAlertIcon />}
      titleSlot="不支持工作区"
      descriptionSlot={
        <>
          工作区功能需要更新版本的 <code className="text-neutral5">@mastra/core</code>。
          <br />
          请升级依赖以启用工作区功能。
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
