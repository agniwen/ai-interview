import { MainContentLayout } from "@mastra/playground-ui/components/MainContent";
import { PromptBlockCreateContent } from "@/components/features/mastra-studio/upstream/domains/prompt-blocks";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

function CmsPromptBlocksCreatePage() {
  const { navigate, paths } = useLinkComponent();

  return (
    <MainContentLayout className="grid-rows-[1fr]">
      <PromptBlockCreateContent
        onSuccess={(block) => navigate(paths.cmsPromptBlockEditLink(block.id))}
      />
    </MainContentLayout>
  );
}

export { CmsPromptBlocksCreatePage };

export default CmsPromptBlocksCreatePage;
