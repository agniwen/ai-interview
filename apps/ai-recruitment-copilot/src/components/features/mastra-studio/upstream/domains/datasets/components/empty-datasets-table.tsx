import { Button } from "@mastra/playground-ui/components/Button";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { Plus, Database, BookOpen } from "lucide-react";

export interface EmptyDatasetsTableProps {
  onCreateClick?: () => void;
}

export function EmptyDatasetsTable({ onCreateClick }: EmptyDatasetsTableProps) {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        iconSlot={<Database className="size-10 text-neutral3" />}
        titleSlot="暂无数据集"
        descriptionSlot="创建首个数据集，开始评估智能体和工作流。"
        actionSlot={
          <div className="flex flex-col sm:flex-row gap-2">
            {onCreateClick && (
              <Button size="lg" variant="default" onClick={onCreateClick}>
                <Icon>
                  <Plus />
                </Icon>
                创建数据集
              </Button>
            )}
            <Button
              size="lg"
              variant="outline"
              as="a"
              href="https://mastra.ai/docs/evals/datasets/overview"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon>
                <BookOpen />
              </Icon>
              文档
            </Button>
          </div>
        }
      />
    </div>
  );
}
