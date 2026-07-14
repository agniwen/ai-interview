import { MainContentLayout } from "@mastra/playground-ui/components/MainContent";
import { ScorerCreateContent } from "@/components/features/mastra-studio/upstream/domains/scores/components/scorer-create-content";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

function CmsScorersCreatePage() {
  const { navigate, paths } = useLinkComponent();

  return (
    <MainContentLayout className="grid-rows-[1fr]">
      <ScorerCreateContent onSuccess={(scorer) => navigate(paths.scorerLink(scorer.id))} />
    </MainContentLayout>
  );
}

export { CmsScorersCreatePage };

export default CmsScorersCreatePage;
