import { Button } from "@mastra/playground-ui/components/Button";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import { CircleSlashIcon, ExternalLinkIcon, Plus } from "lucide-react";
import { useIsCmsAvailable } from "@/components/features/mastra-studio/upstream/domains/cms/hooks/use-is-cms-available";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

export const NoPromptBlocksInfo = () => {
  const { Link, paths } = useLinkComponent();
  const { isCmsAvailable, isLoading } = useIsCmsAvailable();
  const canCreate = !isLoading && isCmsAvailable;

  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        iconSlot={<CircleSlashIcon />}
        titleSlot="暂无提示词"
        descriptionSlot={
          canCreate ? (
            <>创建可复用的提示词块，并在智能体指令中引用。</>
          ) : (
            <>暂无提示词块。提示词块是可复用的内容，可在智能体指令中引用。</>
          )
        }
        actionSlot={
          <div className="flex flex-col items-center gap-2">
            {canCreate && (
              <Button as={Link} to={paths.cmsPromptBlockCreateLink()} variant="primary">
                <Plus />
                创建提示词
              </Button>
            )}
            <Button
              variant="ghost"
              as="a"
              href="https://mastra.ai/en/docs/editor/prompts"
              target="_blank"
              rel="noopener noreferrer"
            >
              提示词文档 <ExternalLinkIcon />
            </Button>
          </div>
        }
      />
    </div>
  );
};
