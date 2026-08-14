import { Button } from "@mastra/playground-ui/components/Button";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import { CircleSlashIcon, ExternalLinkIcon, Plus } from "lucide-react";

export interface NoDatasetsInfoProps {
  onCreateClick?: () => void;
}

export const NoDatasetsInfo = ({ onCreateClick }: NoDatasetsInfoProps = {}) => (
  <div className="flex h-full items-center justify-center">
    <EmptyState
      iconSlot={<CircleSlashIcon />}
      titleSlot="暂无数据集"
      descriptionSlot={
        <>
          创建首个数据集，开始评估 <br />
          智能体和工作流。
        </>
      }
      actionSlot={
        <div className="flex flex-col items-center gap-2">
          {onCreateClick && (
            <Button variant="primary" onClick={onCreateClick}>
              <Plus />
              创建数据集
            </Button>
          )}
          <Button
            variant="ghost"
            as="a"
            href="https://mastra.ai/en/docs/evals/datasets/overview"
            target="_blank"
            rel="noopener noreferrer"
          >
            数据集文档 <ExternalLinkIcon />
          </Button>
        </div>
      }
    />
  </div>
);
